import fs from "node:fs/promises";
import {
  formatMirrorNudgeTelemetry,
  isMirrorNudgeTelemetry,
} from "../telemetry_observers/mirror_nudge_observer.js";

export type TailTelemetryEvent = {
  type: string;
  runId?: string;
  nudges?: string[];
  ts?: number;
  [key: string]: unknown;
};

export type TelemetryFilterOptions = {
  sinceMinutes?: number;
  grep?: string;
  type?: string;
  now?: () => number;
};

export type MirrorTelemetryTailOptions = {
  path?: string;
  json?: boolean;
  once?: boolean;
  limit?: number;
  pollMs?: number;
  sinceMinutes?: number;
  grep?: string;
  type?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  write?: (text: string) => void;
  warn?: (text: string) => void;
};

type MirrorNudgeEnvelope = {
  stream: "telemetry";
  data: {
    type: "mirror.nudge";
    runId?: string;
    nudges: string[];
    ts: number;
  };
};

const DEFAULT_MIRROR_TELEMETRY_SINK_PATH = "./db/mirror-telemetry.ndjson";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveTailPath(pathValue: string | undefined, env: NodeJS.ProcessEnv): string {
  if (pathValue && pathValue.trim()) {
    return pathValue.trim();
  }
  const envPath = env.MIRROR_TELEMETRY_SINK_PATH?.trim();
  return envPath && envPath.length > 0 ? envPath : DEFAULT_MIRROR_TELEMETRY_SINK_PATH;
}

function toMirrorNudgeEnvelope(value: TailTelemetryEvent): MirrorNudgeEnvelope | null {
  const evt: unknown = {
    stream: "telemetry",
    data: value,
  };
  return isMirrorNudgeTelemetry(evt) ? evt : null;
}

function toTailTelemetryEvent(value: unknown): TailTelemetryEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = typeof value.type === "string" ? value.type.trim() : "";
  if (!type) {
    return null;
  }

  const runId = typeof value.runId === "string" ? value.runId : undefined;
  const nudges = Array.isArray(value.nudges)
    ? value.nudges.filter((nudge): nudge is string => typeof nudge === "string")
    : undefined;
  const ts = typeof value.ts === "number" && Number.isFinite(value.ts) ? value.ts : undefined;

  return {
    ...value,
    type,
    runId,
    nudges,
    ts,
  };
}

export function buildTelemetryFilter(
  options: TelemetryFilterOptions = {},
): (evt: TailTelemetryEvent) => boolean {
  const eventType = options.type?.trim() || "mirror.nudge";
  const hasSince = Number.isFinite(options.sinceMinutes);
  const sinceCutoff = hasSince
    ? (options.now ?? Date.now)() - Math.max(0, Number(options.sinceMinutes)) * 60 * 1000
    : undefined;
  const grepNeedle = options.grep?.trim().toLowerCase();

  return (evt: TailTelemetryEvent) => {
    if (evt.type !== eventType) {
      return false;
    }

    if (sinceCutoff !== undefined) {
      if (typeof evt.ts !== "number" || !Number.isFinite(evt.ts) || evt.ts < sinceCutoff) {
        return false;
      }
    }

    if (grepNeedle) {
      const nudges = Array.isArray(evt.nudges)
        ? evt.nudges.filter((nudge): nudge is string => typeof nudge === "string")
        : [];
      if (nudges.length === 0) {
        return false;
      }
      const matchesNudges = nudges.some((nudge) => nudge.toLowerCase().includes(grepNeedle));
      if (!matchesNudges) {
        return false;
      }
    }

    return true;
  };
}

function parseNdjsonText(params: {
  text: string;
  warn: (message: string) => void;
  warnedMalformedRef: { current: boolean };
}): TailTelemetryEvent[] {
  const out: TailTelemetryEvent[] = [];
  const lines = params.text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const evt = toTailTelemetryEvent(parsed);
      if (evt) {
        out.push(evt);
      }
    } catch {
      if (!params.warnedMalformedRef.current) {
        params.warnedMalformedRef.current = true;
        params.warn("Skipping malformed telemetry sink line");
      }
    }
  }
  return out;
}

function formatGenericTelemetryEvent(evt: TailTelemetryEvent): string {
  const runId = evt.runId?.trim() ? evt.runId : "-";
  const ts =
    typeof evt.ts === "number" && Number.isFinite(evt.ts) ? new Date(evt.ts).toISOString() : "-";
  const nudges = Array.isArray(evt.nudges)
    ? evt.nudges.filter((nudge): nudge is string => typeof nudge === "string")
    : [];

  const lines = [
    `🪞 ${evt.type}`,
    `runId: ${runId}`,
    `ts: ${ts}`,
    ...nudges.map((nudge) => `- ${nudge}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function writeTelemetryEvent(params: {
  evt: TailTelemetryEvent;
  jsonMode: boolean;
  write: (text: string) => void;
}) {
  if (params.jsonMode) {
    params.write(`${JSON.stringify(params.evt)}\n`);
    return;
  }

  if (params.evt.type === "mirror.nudge") {
    const mirrorNudge = toMirrorNudgeEnvelope(params.evt);
    if (mirrorNudge) {
      params.write(formatMirrorNudgeTelemetry(mirrorNudge));
      return;
    }
  }

  params.write(formatGenericTelemetryEvent(params.evt));
}

function resolveBacklogLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 20;
  }
  if (!Number.isFinite(limit)) {
    return 20;
  }
  return Math.max(0, Math.floor(limit));
}

async function readFileBytes(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    const maybeCode = err as NodeJS.ErrnoException;
    if (maybeCode?.code === "ENOENT") {
      return Buffer.alloc(0);
    }
    throw err;
  }
}

async function waitWithAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function tailMirrorTelemetry(params: MirrorTelemetryTailOptions = {}): Promise<void> {
  const filePath = resolveTailPath(params.path, params.env ?? process.env);
  const write = params.write ?? ((text: string) => process.stdout.write(text));
  const warn = params.warn ?? ((text: string) => console.error(text));
  const limit = resolveBacklogLimit(params.limit);
  const pollMs = params.pollMs ?? 200;
  const jsonMode = params.json === true;
  const matchesFilter = buildTelemetryFilter({
    sinceMinutes: params.sinceMinutes,
    grep: params.grep,
    type: params.type,
  });
  const warnedMalformedRef = { current: false };

  const initial = await readFileBytes(filePath);
  const initialEvents = parseNdjsonText({
    text: initial.toString("utf8"),
    warn,
    warnedMalformedRef,
  });
  const filteredBacklog = initialEvents.filter(matchesFilter);
  const backlog = limit === 0 ? [] : filteredBacklog.slice(-limit);
  for (const evt of backlog) {
    writeTelemetryEvent({ evt, jsonMode, write });
  }

  if (params.once) {
    return;
  }

  let byteOffset = initial.length;
  let pending = "";
  while (!params.signal?.aborted) {
    const next = await readFileBytes(filePath);
    if (next.length < byteOffset) {
      byteOffset = 0;
      pending = "";
    }
    if (next.length > byteOffset) {
      const chunk = next.subarray(byteOffset).toString("utf8");
      byteOffset = next.length;
      const combined = pending + chunk;
      const lines = combined.split("\n");
      pending = lines.pop() ?? "";
      const newEvents = parseNdjsonText({
        text: lines.join("\n"),
        warn,
        warnedMalformedRef,
      }).filter(matchesFilter);
      for (const evt of newEvents) {
        writeTelemetryEvent({ evt, jsonMode, write });
      }
    }
    await waitWithAbort(pollMs, params.signal);
  }
}
