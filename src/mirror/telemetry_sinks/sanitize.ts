import type { TelemetrySinkEvent } from "./types.js";

const MAX_NUDGES = 3;
const MAX_NUDGE_LENGTH = 140;

function normalizeString(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNudge(nudge: string): string {
  const collapsed = normalizeString(nudge);
  if (collapsed.length <= MAX_NUDGE_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_NUDGE_LENGTH - 1).trimEnd()}…`;
}

export function sanitizeTelemetrySinkEvent(event: TelemetrySinkEvent): TelemetrySinkEvent {
  if (event.type === "mirror.nudge") {
    const runId = event.runId ? normalizeString(event.runId) : undefined;
    const nudges = event.nudges
      .map((nudge) => normalizeNudge(nudge))
      .filter(Boolean)
      .slice(0, MAX_NUDGES);

    return {
      type: "mirror.nudge",
      runId: runId || undefined,
      nudges,
      ts: Number.isFinite(event.ts) ? event.ts : Date.now(),
    };
  }

  return event;
}
