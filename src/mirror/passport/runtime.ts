export type MirrorPassportTelemetryEvent = {
  type: "mirror.passport";
  ts: number;
  runId?: string;
  agentId?: string;
  boundary: "local" | "pond";
  telemetry: {
    sinkEnabled: boolean;
    sinkPath?: string;
    indexDbPath?: string;
  };
};

export type BuildMirrorPassportTelemetryEventParams = {
  runId?: string;
  agentId?: string;
  boundary?: "local" | "pond";
  telemetry: {
    sinkEnabled: boolean;
    sinkPath?: string;
    indexDbPath?: string;
  };
};

function trimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function buildMirrorPassportTelemetryEvent(
  params: BuildMirrorPassportTelemetryEventParams,
): MirrorPassportTelemetryEvent {
  return {
    type: "mirror.passport",
    ts: Date.now(),
    runId: trimmed(params.runId),
    agentId: trimmed(params.agentId),
    boundary: params.boundary ?? "pond",
    telemetry: {
      sinkEnabled: params.telemetry.sinkEnabled,
      sinkPath: trimmed(params.telemetry.sinkPath),
      indexDbPath: trimmed(params.telemetry.indexDbPath),
    },
  };
}
