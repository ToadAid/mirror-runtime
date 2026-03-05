import { isMirrorNudgeTelemetry } from "../telemetry_observers/mirror_nudge_observer.js";
import { appendTelemetrySinkEventFromEnv } from "./ndjson_sink.js";

export function writeTelemetryEventIfEnabled(event: unknown): void {
  if (process.env.MIRROR_TELEMETRY_ENABLED !== "1") {
    return;
  }
  if (process.env.MIRROR_TELEMETRY_SINK_ENABLED !== "1") {
    return;
  }
  if (!isMirrorNudgeTelemetry(event)) {
    return;
  }

  try {
    void appendTelemetrySinkEventFromEnv(event.data).catch((err: unknown) => {
      console.warn("[mirror.telemetry] sink write failed", err);
    });
  } catch (err) {
    console.warn("[mirror.telemetry] sink write failed", err);
  }
}
