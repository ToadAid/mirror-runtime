export {
  appendTelemetrySinkEvent,
  appendTelemetrySinkEventFromEnv,
  DEFAULT_MIRROR_TELEMETRY_SINK_PATH,
  isMirrorTelemetrySinkEnabled,
  resolveMirrorTelemetrySinkPath,
} from "./ndjson_sink.js";
export { sanitizeTelemetrySinkEvent } from "./sanitize.js";
export type { MirrorNudgeTelemetrySinkEvent, TelemetrySinkEvent } from "./types.js";
