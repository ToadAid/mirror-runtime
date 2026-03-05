import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { acquireSinkLock } from "./lock.js";
import { rotateIfNeeded } from "./rotate.js";
import { sanitizeTelemetrySinkEvent } from "./sanitize.js";
import type { TelemetrySinkEvent } from "./types.js";

export const DEFAULT_MIRROR_TELEMETRY_SINK_PATH = "./db/mirror-telemetry.ndjson";
export const DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES = 5_000_000;
export const DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP = 5;
export const DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_ENABLED = true;
export const DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_TIMEOUT_MS = 2_000;
export const DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_POLL_MS = 25;

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

export function resolveMirrorTelemetrySinkLockEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = env.MIRROR_TELEMETRY_SINK_LOCK_ENABLED?.trim();
  if (!configured) {
    return DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_ENABLED;
  }
  return configured === "1";
}

export function resolveMirrorTelemetrySinkLockPath(params: {
  filePath: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const configured = params.env?.MIRROR_TELEMETRY_SINK_LOCK_PATH?.trim();
  return configured && configured.length > 0 ? configured : `${params.filePath}.lock`;
}

export function resolveMirrorTelemetrySinkLockTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parsePositiveIntOrDefault(
    env.MIRROR_TELEMETRY_SINK_LOCK_TIMEOUT_MS,
    DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_TIMEOUT_MS,
  );
}

export function resolveMirrorTelemetrySinkLockPollMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveIntOrDefault(
    env.MIRROR_TELEMETRY_SINK_LOCK_POLL_MS,
    DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_POLL_MS,
  );
}

export async function appendTelemetrySinkEvent(params: {
  event: TelemetrySinkEvent;
  filePath: string;
  rotateBytes?: number;
  rotateKeep?: number;
  lockEnabled?: boolean;
  lockPath?: string;
  lockTimeoutMs?: number;
  lockPollMs?: number;
}): Promise<void> {
  const sanitized = sanitizeTelemetrySinkEvent(params.event);
  const rotateBytes = params.rotateBytes ?? DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES;
  const rotateKeep = params.rotateKeep ?? DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP;
  const lockEnabled = params.lockEnabled ?? DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_ENABLED;
  const lockPath = params.lockPath ?? `${params.filePath}.lock`;
  const lockTimeoutMs = params.lockTimeoutMs ?? DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_TIMEOUT_MS;
  const lockPollMs = params.lockPollMs ?? DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_POLL_MS;

  mkdirSync(path.dirname(params.filePath), { recursive: true });
  if (lockEnabled) {
    mkdirSync(path.dirname(lockPath), { recursive: true });
  }

  const release = lockEnabled
    ? acquireSinkLock({
        lockPath,
        timeoutMs: lockTimeoutMs,
        pollMs: lockPollMs,
      })
    : () => {};

  try {
    rotateIfNeeded(params.filePath, rotateBytes, rotateKeep);
    appendFileSync(params.filePath, `${JSON.stringify(sanitized)}\n`, "utf8");
  } finally {
    release();
  }
}

export async function appendTelemetrySinkEventFromEnv(
  event: TelemetrySinkEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isMirrorTelemetrySinkEnabled(env)) {
    return false;
  }

  const filePath = resolveMirrorTelemetrySinkPath(env);
  await appendTelemetrySinkEvent({
    event,
    filePath,
    rotateBytes: resolveMirrorTelemetrySinkRotateBytes(env),
    rotateKeep: resolveMirrorTelemetrySinkRotateKeep(env),
    lockEnabled: resolveMirrorTelemetrySinkLockEnabled(env),
    lockPath: resolveMirrorTelemetrySinkLockPath({ filePath, env }),
    lockTimeoutMs: resolveMirrorTelemetrySinkLockTimeoutMs(env),
    lockPollMs: resolveMirrorTelemetrySinkLockPollMs(env),
  });
  return true;
}
