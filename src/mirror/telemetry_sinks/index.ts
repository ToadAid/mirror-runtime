export {
  appendTelemetrySinkEvent,
  appendTelemetrySinkEventFromEnv,
  DEFAULT_MIRROR_TELEMETRY_SINK_PATH,
  DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_BYTES,
  DEFAULT_MIRROR_TELEMETRY_SINK_ROTATE_KEEP,
  isMirrorTelemetrySinkEnabled,
  resolveMirrorTelemetrySinkPath,
  resolveMirrorTelemetrySinkRotateBytes,
  resolveMirrorTelemetrySinkRotateKeep,
} from "./ndjson_sink.js";
export { rotateIfNeeded } from "./rotate.js";
export { sanitizeTelemetrySinkEvent } from "./sanitize.js";
export type { MirrorNudgeTelemetrySinkEvent, TelemetrySinkEvent } from "./types.js";
