export {
  appendTelemetrySinkEvent,
  appendTelemetrySinkEventFromEnv,
  DEFAULT_MIRROR_TELEMETRY_SINK_PATH,
  DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES,
  DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP,
  DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_ENABLED,
  DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_TIMEOUT_MS,
  DEFAULT_MIRROR_TELEMETRY_SINK_LOCK_POLL_MS,
  isMirrorTelemetrySinkEnabled,
  resolveMirrorTelemetrySinkPath,
  resolveMirrorTelemetrySinkRotateBytes,
  resolveMirrorTelemetrySinkRotateKeep,
  resolveMirrorTelemetrySinkLockEnabled,
  resolveMirrorTelemetrySinkLockPath,
  resolveMirrorTelemetrySinkLockTimeoutMs,
  resolveMirrorTelemetrySinkLockPollMs,
} from "./ndjson_sink.js";
export { acquireSinkLock } from "./lock.js";
export { rotateIfNeeded } from "./rotate.js";
export { sanitizeTelemetrySinkEvent } from "./sanitize.js";
export type { MirrorNudgeTelemetrySinkEvent, TelemetrySinkEvent } from "./types.js";
