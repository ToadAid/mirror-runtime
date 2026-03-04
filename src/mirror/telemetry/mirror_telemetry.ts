export type MirrorTelemetryEvent = {
  type: "mirror.nudge";
  runId?: string;
  nudges: string[];
  ts: number;
};

const MAX_NUDGES = 3;
const MAX_NUDGE_LENGTH = 140;

function normalizeNudge(nudge: string): string {
  const collapsed = nudge.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_NUDGE_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_NUDGE_LENGTH - 1).trimEnd()}…`;
}

export function buildMirrorNudgeTelemetryEvent(params: {
  runId?: string;
  nudges: string[];
}): MirrorTelemetryEvent {
  const nudges = params.nudges
    .map((nudge) => normalizeNudge(nudge))
    .filter(Boolean)
    .slice(0, MAX_NUDGES);
  return {
    type: "mirror.nudge",
    runId: params.runId,
    nudges,
    ts: Date.now(),
  };
}
