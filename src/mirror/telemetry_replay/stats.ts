import type { TelemetryEnvelope } from "./replay.js";

export type TelemetrySummary = {
  total: number;
  byType: Record<string, number>;
  lastTs?: number;
};

export type MirrorNudgeSummary = {
  count: number;
  lastTs?: number;
  sampleNudges: string[];
};

function truncateForDisplay(text: string, maxLength = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function summarizeTelemetry(events: TelemetryEnvelope[]): TelemetrySummary {
  const byType: Record<string, number> = {};
  let lastTs: number | undefined;

  for (const evt of events) {
    const type = typeof evt.data.type === "string" ? evt.data.type : "unknown";
    byType[type] = (byType[type] ?? 0) + 1;
    if (typeof evt.data.ts === "number" && Number.isFinite(evt.data.ts)) {
      lastTs = lastTs === undefined ? evt.data.ts : Math.max(lastTs, evt.data.ts);
    }
  }

  return {
    total: events.length,
    byType,
    lastTs,
  };
}

export function summarizeMirrorNudges(events: TelemetryEnvelope[]): MirrorNudgeSummary {
  let count = 0;
  let lastTs: number | undefined;
  const sampleNudges: string[] = [];

  for (const evt of events) {
    if (evt.data.type !== "mirror.nudge") {
      continue;
    }
    count += 1;
    if (typeof evt.data.ts === "number" && Number.isFinite(evt.data.ts)) {
      lastTs = lastTs === undefined ? evt.data.ts : Math.max(lastTs, evt.data.ts);
    }
    const nudges = Array.isArray(evt.data.nudges)
      ? evt.data.nudges.filter((nudge): nudge is string => typeof nudge === "string")
      : [];
    for (const nudge of nudges) {
      if (sampleNudges.length >= 3) {
        break;
      }
      sampleNudges.push(truncateForDisplay(nudge, 140));
    }
    if (sampleNudges.length >= 3) {
      break;
    }
  }

  return {
    count,
    lastTs,
    sampleNudges,
  };
}
