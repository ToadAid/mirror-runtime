import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { rotateIfNeeded } from "./rotate.js";
import { sanitizeTelemetrySinkEvent } from "./sanitize.js";
import type { TelemetrySinkEvent } from "./types.js";

export const DEFAULT_MIRROR_TELEMETRY_SINK_PATH = "./db/mirror-telemetry.ndjson";
export const DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES = 5_000_000;
export const DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP = 5;

function parsePositiveIntOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function isMirrorTelemetrySinkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_TELEMETRY_SINK_ENABLED === "1";
}

export function resolveMirrorTelemetrySinkPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MIRROR_TELEMETRY_SINK_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_MIRROR_TELEMETRY_SINK_PATH;
}

export function resolveMirrorTelemetrySinkRotateBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parsePositiveIntOrDefault(
    env.MIRROR_TELEMETRY_SINK_ROTATE_BYTES,
    DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES,
  );
}

export function resolveMirrorTelemetrySinkRotateKeep(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveIntOrDefault(
    env.MIRROR_TELEMETRY_SINK_ROTATE_KEEP,
    DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP,
  );
}

export async function appendTelemetrySinkEvent(params: {
  event: TelemetrySinkEvent;
  filePath: string;
  rotateBytes?: number;
  rotateKeep?: number;
}): Promise<void> {
  const sanitized = sanitizeTelemetrySinkEvent(params.event);
  const rotateBytes = params.rotateBytes ?? DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES;
  const rotateKeep = params.rotateKeep ?? DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP;

  mkdirSync(path.dirname(params.filePath), { recursive: true });
  rotateIfNeeded(params.filePath, rotateBytes, rotateKeep);
  appendFileSync(params.filePath, `${JSON.stringify(sanitized)}\n`, "utf8");
}

export async function appendTelemetrySinkEventFromEnv(
  event: TelemetrySinkEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isMirrorTelemetrySinkEnabled(env)) {
    return false;
  }

  await appendTelemetrySinkEvent({
    event,
    filePath: resolveMirrorTelemetrySinkPath(env),
    rotateBytes: resolveMirrorTelemetrySinkRotateBytes(env),
    rotateKeep: resolveMirrorTelemetrySinkRotateKeep(env),
  });
  return true;
}
