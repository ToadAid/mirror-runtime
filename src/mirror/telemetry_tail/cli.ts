import type { Command } from "commander";
import {
  formatMirrorNudgeTelemetry,
  isMirrorNudgeTelemetry,
} from "../telemetry_observers/mirror_nudge_observer.js";
import {
  replayTelemetry,
  summarizeMirrorNudges,
  summarizeTelemetry,
} from "../telemetry_replay/index.js";
import { resolveMirrorTelemetrySinkPath } from "../telemetry_sinks/ndjson_sink.js";
import { tailMirrorTelemetry } from "./tail.js";

export type MirrorTelemetryTailCliOptions = {
  json?: boolean;
  once?: boolean;
  limit?: number;
  path?: string;
  sinceMinutes?: number;
  grep?: string;
  type?: string;
};

export type MirrorTelemetryReplayCliOptions = {
  json?: boolean;
  stats?: boolean;
  limit?: number;
  path?: string;
  sinceMinutes?: number;
  grep?: string;
  type?: string;
};

function parseLimit(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --limit: ${raw}`);
  }
  return value;
}

function parseSinceMinutes(raw: string): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --since: ${raw}`);
  }
  return value;
}

function formatIso(ts: number | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return "-";
  }
  return new Date(ts).toISOString();
}

export async function runMirrorTelemetryTailCli(
  opts: MirrorTelemetryTailCliOptions,
): Promise<void> {
  await tailMirrorTelemetry({
    json: opts.json,
    once: opts.once,
    limit: opts.limit,
    path: opts.path,
    sinceMinutes: opts.sinceMinutes,
    grep: opts.grep,
    type: opts.type,
  });
}

export async function runMirrorTelemetryReplayCli(
  opts: MirrorTelemetryReplayCliOptions,
): Promise<void> {
  const filePath = opts.path ?? resolveMirrorTelemetrySinkPath(process.env);
  const events = await replayTelemetry({
    path: filePath,
    sinceMinutes: opts.sinceMinutes,
    grep: opts.grep,
    type: opts.type,
    limit: opts.limit,
  });

  if (opts.stats) {
    const summary = summarizeTelemetry(events);
    const nudgeSummary = summarizeMirrorNudges(events);
    const byTypeLines = Object.entries(summary.byType)
      .toSorted((a, b) => a[0].localeCompare(b[0]))
      .map(([type, count]) => `- ${type}: ${count}`);

    const lines = [
      "🪞 telemetry.stats",
      `total: ${summary.total}`,
      `lastTs: ${formatIso(summary.lastTs)}`,
      "byType:",
      ...(byTypeLines.length > 0 ? byTypeLines : ["- (none)"]),
      `mirror.nudge.count: ${nudgeSummary.count}`,
      `mirror.nudge.lastTs: ${formatIso(nudgeSummary.lastTs)}`,
      "sampleNudges:",
      ...(nudgeSummary.sampleNudges.length > 0
        ? nudgeSummary.sampleNudges.map((nudge) => `- ${nudge}`)
        : ["- (none)"]),
      "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  for (const evt of events) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(evt)}\n`);
      continue;
    }
    if (isMirrorNudgeTelemetry(evt)) {
      process.stdout.write(formatMirrorNudgeTelemetry(evt));
      continue;
    }

    const runId =
      typeof evt.data.runId === "string" && evt.data.runId.trim() ? evt.data.runId : "-";
    const type = typeof evt.data.type === "string" ? evt.data.type : "unknown";
    const nudges = Array.isArray(evt.data.nudges)
      ? evt.data.nudges.filter((nudge): nudge is string => typeof nudge === "string")
      : [];
    const lines = [
      `🪞 ${type}`,
      `runId: ${runId}`,
      `ts: ${formatIso(typeof evt.data.ts === "number" ? evt.data.ts : undefined)}`,
      ...nudges.map((nudge) => `- ${nudge}`),
      "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

export function registerMirrorTelemetryCli(program: Command): void {
  const mirror = program.command("mirror").description("Mirror diagnostics and telemetry tools");
  const telemetry = mirror.command("telemetry").description("Mirror telemetry commands");

  telemetry
    .command("tail")
    .description("Tail local mirror telemetry sink (mirror.nudge)")
    .option("--json", "Output matched events as JSON", false)
    .option("--limit <n>", "Backlog event count before follow mode", parseLimit, 20)
    .option("--once", "Print backlog and exit", false)
    .option("--path <path>", "Telemetry sink path (overrides env/default)")
    .action(async (opts: { json?: boolean; limit?: number; once?: boolean; path?: string }) => {
      await runMirrorTelemetryTailCli({
        json: opts.json === true,
        limit: opts.limit,
        once: opts.once === true,
        path: opts.path,
      });
    });

  telemetry
    .command("replay")
    .description("Replay local mirror telemetry sink events")
    .option("--path <path>", "Telemetry sink path (overrides env/default)")
    .option("--since <minutes>", "Include events newer than N minutes", parseSinceMinutes)
    .option("--grep <text>", "Case-insensitive substring match against nudges")
    .option("--type <eventType>", "Event type filter", "mirror.nudge")
    .option("--limit <n>", "Maximum events to replay", parseLimit, 200)
    .option("--json", "Output matched events as NDJSON", false)
    .option("--stats", "Print summary stats only", false)
    .action(
      async (opts: {
        path?: string;
        since?: number;
        grep?: string;
        type?: string;
        limit?: number;
        json?: boolean;
        stats?: boolean;
      }) => {
        await runMirrorTelemetryReplayCli({
          path: opts.path,
          sinceMinutes: opts.since,
          grep: opts.grep,
          type: opts.type,
          limit: opts.limit,
          json: opts.json === true,
          stats: opts.stats === true,
        });
      },
    );
}
