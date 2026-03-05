import fs from "node:fs/promises";

export type TelemetryEnvelope = {
  stream: string;
  data: {
    type?: string;
    ts?: number;
    runId?: string;
    nudges?: string[];
    [key: string]: unknown;
  };
};

export type ReplayTelemetryOptions = {
  path: string;
  sinceMinutes?: number;
  grep?: string;
  type?: string;
  limit?: number;
  now?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readNdjsonLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export function parseTelemetryEvent(line: string): TelemetryEnvelope | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (typeof parsed.stream === "string" && isRecord(parsed.data)) {
      return {
        stream: parsed.stream,
        data: parsed.data,
      };
    }

    if (typeof parsed.type === "string") {
      return {
        stream: "telemetry",
        data: parsed,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function matchesSince(
  evt: TelemetryEnvelope,
  sinceMinutes: number | undefined,
  now: () => number,
): boolean {
  if (!Number.isFinite(sinceMinutes)) {
    return true;
  }
  const cutoff = now() - Number(sinceMinutes) * 60_000;
  const ts = evt.data.ts;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return false;
  }
  return ts >= cutoff;
}

function matchesGrep(evt: TelemetryEnvelope, grep: string | undefined): boolean {
  const needle = grep?.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const nudges = Array.isArray(evt.data.nudges)
    ? evt.data.nudges.filter((nudge): nudge is string => typeof nudge === "string")
    : [];
  if (nudges.length === 0) {
    return false;
  }
  return nudges.join(" ").toLowerCase().includes(needle);
}

function matchesType(evt: TelemetryEnvelope, type: string | undefined): boolean {
  const effectiveType = type?.trim();
  if (!effectiveType) {
    return true;
  }
  return evt.data.type === effectiveType;
}

export async function replayTelemetry(
  options: ReplayTelemetryOptions,
): Promise<TelemetryEnvelope[]> {
  const lines = await readNdjsonLines(options.path);
  const events = lines
    .map((line) => parseTelemetryEvent(line))
    .filter((evt): evt is TelemetryEnvelope => evt !== null)
    .filter((evt) => matchesType(evt, options.type))
    .filter((evt) => matchesSince(evt, options.sinceMinutes, options.now ?? Date.now))
    .filter((evt) => matchesGrep(evt, options.grep));

  const limit =
    Number.isFinite(options.limit) && (options.limit ?? 0) > 0
      ? Math.floor(options.limit as number)
      : 200;
  return events.slice(-limit);
}
