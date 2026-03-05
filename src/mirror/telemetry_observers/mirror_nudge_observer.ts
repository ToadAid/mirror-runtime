import { isRecord } from "../../utils.js";
import type { MirrorTelemetryEvent } from "../telemetry/mirror_telemetry.js";

type MirrorNudgeEnvelope = {
  stream: "telemetry";
  data: MirrorTelemetryEvent;
};

function isMirrorNudgeData(value: unknown): value is MirrorTelemetryEvent {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type !== "mirror.nudge") {
    return false;
  }
  if (value.runId !== undefined && typeof value.runId !== "string") {
    return false;
  }
  if (typeof value.ts !== "number" || !Number.isFinite(value.ts)) {
    return false;
  }
  if (!Array.isArray(value.nudges) || value.nudges.some((nudge) => typeof nudge !== "string")) {
    return false;
  }
  return true;
}

export function isMirrorNudgeTelemetry(evt: unknown): evt is MirrorNudgeEnvelope {
  if (!isRecord(evt)) {
    return false;
  }
  if (evt.stream !== "telemetry") {
    return false;
  }
  return isMirrorNudgeData(evt.data);
}

export function formatMirrorNudgeTelemetry(evt: MirrorNudgeEnvelope): string {
  const runId = evt.data.runId?.trim() ? evt.data.runId : "-";
  const lines = [
    "🪞 mirror.nudge",
    `runId: ${runId}`,
    `ts: ${new Date(evt.data.ts).toISOString()}`,
    ...evt.data.nudges.map((nudge) => `- ${nudge}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
