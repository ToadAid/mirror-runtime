import fs from "node:fs/promises";
import {
  isMirrorNudgeTelemetry,
  formatMirrorNudgeTelemetry,
} from "../telemetry_observers/mirror_nudge_observer.js";

export type MirrorTelemetryTailOptions = {
  path?: string;
  json?: boolean;
  once?: boolean;
  limit?: number;
  pollMs?: number;
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

function resolveTailPath(pathValue: string | undefined, env: NodeJS.ProcessEnv): string {
  if (pathValue && pathValue.trim()) {
    return pathValue.trim();
  }
  const envPath = env.MIRROR_TELEMETRY_SINK_PATH?.trim();
  return envPath && envPath.length > 0 ? envPath : DEFAULT_MIRROR_TELEMETRY_SINK_PATH;
}

function toMirrorNudgeEnvelope(value: unknown): MirrorNudgeEnvelope | null {
  const evt: unknown = {
    stream: "telemetry",
    data: value,
  };
  return isMirrorNudgeTelemetry(evt) ? evt : null;
}

function parseNdjsonText(text: string, warn: (message: string) => void): MirrorNudgeEnvelope[] {
  const out: MirrorNudgeEnvelope[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const evt = toMirrorNudgeEnvelope(parsed);
      if (evt) {
        out.push(evt);
      }
    } catch {
      warn("Skipping malformed telemetry sink line");
    }
  }
  return out;
}

function writeTelemetryEvent(params: {
  evt: MirrorNudgeEnvelope;
  jsonMode: boolean;
  write: (text: string) => void;
}) {
  if (params.jsonMode) {
    params.write(`${JSON.stringify(params.evt.data)}\n`);
    return;
  }
  params.write(formatMirrorNudgeTelemetry(params.evt));
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

  const initial = await readFileBytes(filePath);
  const initialEvents = parseNdjsonText(initial.toString("utf8"), warn);
  const backlog = limit === 0 ? [] : initialEvents.slice(-limit);
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
      const newEvents = parseNdjsonText(lines.join("\n"), warn);
      for (const evt of newEvents) {
        writeTelemetryEvent({ evt, jsonMode, write });
      }
    }
    await waitWithAbort(pollMs, params.signal);
  }
}
