import type { ParsedTelemetryEnvelope } from "../telemetry_index/query.js";

const MAX_NUDGES_PER_EVENT = 3;
const MAX_NUDGE_LENGTH = 140;

export type ReflectInputEvent = ParsedTelemetryEnvelope;

export type ReflectLatestRun = {
  runId: string;
  lastSeenTs: number;
  nudgeCount: number;
};

export type ReflectTopNudge = {
  nudge: string;
  count: number;
};

export type ReflectSummary = {
  windowMinutes: number;
  runId?: string;
  type: string;
  limit: number;
  totalEventsScanned: number;
  totalNudges: number;
  uniqueRunIds: number;
  topNudges: ReflectTopNudge[];
  latestRunIds: ReflectLatestRun[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNudge(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NUDGE_LENGTH);
}

function extractNudges(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.nudges)) {
    return [];
  }

  const nudges: string[] = [];
  for (const entry of data.nudges) {
    if (typeof entry !== "string") {
      continue;
    }
    const normalized = normalizeNudge(entry);
    if (!normalized) {
      continue;
    }
    nudges.push(normalized);
    if (nudges.length >= MAX_NUDGES_PER_EVENT) {
      break;
    }
  }
  return nudges;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function formatIso(ts: number | undefined): string {
  return typeof ts === "number" && Number.isFinite(ts) ? new Date(ts).toISOString() : "-";
}

export function summarizeReflectEvents(
  events: ReflectInputEvent[],
  options: { windowMinutes: number; runId?: string; type: string; limit: number },
): ReflectSummary {
  const nudgeCounts = new Map<string, number>();
  const runStats = new Map<string, ReflectLatestRun>();

  let totalNudges = 0;

  for (const event of events) {
    if (!isRecord(event.data)) {
      continue;
    }

    const runId = toNonEmptyString(event.data.runId);
    const ts = toFiniteNumber(event.data.ts);
    const nudges = extractNudges(event.data);

    totalNudges += nudges.length;

    for (const nudge of nudges) {
      nudgeCounts.set(nudge, (nudgeCounts.get(nudge) ?? 0) + 1);
    }

    if (runId) {
      const existing = runStats.get(runId);
      if (!existing) {
        runStats.set(runId, {
          runId,
          lastSeenTs: ts ?? 0,
          nudgeCount: nudges.length,
        });
        continue;
      }
      runStats.set(runId, {
        runId,
        lastSeenTs: Math.max(existing.lastSeenTs, ts ?? 0),
        nudgeCount: existing.nudgeCount + nudges.length,
      });
    }
  }

  const topNudges = [...nudgeCounts.entries()]
    .map(([nudge, count]) => ({ nudge, count }))
    .toSorted((a, b) => b.count - a.count || a.nudge.localeCompare(b.nudge))
    .slice(0, 5);

  const latestRunIds = [...runStats.values()]
    .toSorted((a, b) => b.lastSeenTs - a.lastSeenTs || a.runId.localeCompare(b.runId))
    .slice(0, 5);

  return {
    windowMinutes: options.windowMinutes,
    runId: options.runId,
    type: options.type,
    limit: options.limit,
    totalEventsScanned: events.length,
    totalNudges,
    uniqueRunIds: runStats.size,
    topNudges,
    latestRunIds,
  };
}

export function formatReflectSummary(summary: ReflectSummary): string {
  const windowLine = `window: since=${summary.windowMinutes}m runId=${summary.runId ?? "-"} limit=${summary.limit} type=${summary.type}`;
  const topNudgeLines =
    summary.topNudges.length > 0
      ? summary.topNudges.map((item) => `- ${item.nudge} (${item.count})`)
      : ["- (none)"];
  const runLines =
    summary.latestRunIds.length > 0
      ? summary.latestRunIds.map(
          (item) =>
            `- ${item.runId} lastSeen=${formatIso(item.lastSeenTs)} nudges=${item.nudgeCount}`,
        )
      : ["- (none)"];

  const lines = [
    "🪞 mirror.reflect",
    windowLine,
    "counts:",
    `- total events scanned: ${summary.totalEventsScanned}`,
    `- total nudges: ${summary.totalNudges}`,
    `- unique runIds: ${summary.uniqueRunIds}`,
    "top repeated nudges:",
    ...topNudgeLines,
    "latest runIds:",
    ...runLines,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
