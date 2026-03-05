import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeTelemetrySinkEvent } from "./sanitize.js";
import type { TelemetrySinkEvent } from "./types.js";

export const DEFAULT_MIRROR_TELEMETRY_SINK_PATH = "./db/mirror-telemetry.ndjson";

export function isMirrorTelemetrySinkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_TELEMETRY_SINK_ENABLED === "1";
}

export function resolveMirrorTelemetrySinkPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MIRROR_TELEMETRY_SINK_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_MIRROR_TELEMETRY_SINK_PATH;
}

export async function appendTelemetrySinkEvent(params: {
  event: TelemetrySinkEvent;
  filePath: string;
}): Promise<void> {
  const sanitized = sanitizeTelemetrySinkEvent(params.event);
  await fs.mkdir(path.dirname(params.filePath), { recursive: true });
  await fs.appendFile(params.filePath, `${JSON.stringify(sanitized)}\n`, "utf8");
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
  });
  return true;
}
