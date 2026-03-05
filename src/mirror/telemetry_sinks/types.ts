export type MirrorNudgeTelemetrySinkEvent = {
  type: "mirror.nudge";
  runId?: string;
  nudges: string[];
  ts: number;
};

export type TelemetrySinkEvent = MirrorNudgeTelemetrySinkEvent;
