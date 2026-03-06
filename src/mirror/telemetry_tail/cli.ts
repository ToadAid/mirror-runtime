// Active source of truth for `openclaw mirror ...` subcommands.
import type { Command } from "commander";
import { formatMirrorDoctorHuman, runMirrorDoctor } from "../doctor/index.js";
import { buildMirrorPassport, formatMirrorPassport } from "../passport/index.js";
import { formatMirrorStatusHuman, getMirrorStatus } from "../status/index.js";
import {
  indexTelemetryFile,
  parseIndexedPayload,
  queryTelemetryEvents,
  resolveMirrorTelemetryIndexDbPath,
} from "../telemetry_index/index.js";
import {
  formatMirrorNudgeTelemetry,
  isMirrorNudgeTelemetry,
} from "../telemetry_observers/mirror_nudge_observer.js";
import { formatReflectSummary, summarizeReflectEvents } from "../telemetry_reflect/index.js";
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

export type MirrorTelemetryIndexCliOptions = {
  path?: string;
  db?: string;
  rebuild?: boolean;
};

export type MirrorTelemetryQueryCliOptions = {
  type?: string;
  runId?: string;
  sinceMinutes?: number;
  limit?: number;
  json?: boolean;
  db?: string;
};

export type MirrorTelemetryReflectCliOptions = {
  type?: string;
  runId?: string;
  sinceMinutes?: number;
  limit?: number;
  json?: boolean;
  db?: string;
};

export type MirrorPassportCliOptions = {
  json?: boolean;
  includeLocal?: boolean;
};

export type MirrorStatusCliOptions = {
  json?: boolean;
  ndjsonPath?: string;
  db?: string;
};

export type MirrorDoctorCliOptions = {
  json?: boolean;
  ndjsonPath?: string;
  db?: string;
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

export async function runMirrorTelemetryIndexCli(
  opts: MirrorTelemetryIndexCliOptions,
): Promise<void> {
  const sourcePath = opts.path ?? resolveMirrorTelemetrySinkPath(process.env);
  const dbPath = opts.db ?? resolveMirrorTelemetryIndexDbPath(process.env);
  const count = await indexTelemetryFile({
    sourcePath,
    dbPath,
    rebuild: opts.rebuild === true,
  });
  process.stdout.write(`Indexed ${count} events\n`);
}

export async function runMirrorTelemetryQueryCli(
  opts: MirrorTelemetryQueryCliOptions,
): Promise<void> {
  const dbPath = opts.db ?? resolveMirrorTelemetryIndexDbPath(process.env);
  const sinceTs =
    typeof opts.sinceMinutes === "number" && Number.isFinite(opts.sinceMinutes)
      ? Date.now() - opts.sinceMinutes * 60_000
      : undefined;

  const rows = queryTelemetryEvents(
    {
      type: opts.type?.trim() || "mirror.nudge",
      runId: opts.runId,
      sinceTs,
      limit: opts.limit ?? 50,
    },
    dbPath,
  );

  for (const row of rows) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(row)}\n`);
      continue;
    }

    const parsed = parseIndexedPayload(row);
    if (!parsed) {
      continue;
    }

    if (isMirrorNudgeTelemetry(parsed)) {
      process.stdout.write(formatMirrorNudgeTelemetry(parsed));
      continue;
    }

    const runId = row.run_id?.trim() ? row.run_id : "-";
    const tsIso = formatIso(row.ts);
    const nudges = Array.isArray(parsed.data.nudges)
      ? parsed.data.nudges.filter((nudge): nudge is string => typeof nudge === "string")
      : [];
    const lines = [
      `🪞 ${row.type}`,
      `runId: ${runId}`,
      `ts: ${tsIso}`,
      ...nudges.map((nudge) => `- ${nudge}`),
      "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

export async function runMirrorTelemetryReflectCli(
  opts: MirrorTelemetryReflectCliOptions,
): Promise<void> {
  const dbPath = opts.db ?? resolveMirrorTelemetryIndexDbPath(process.env);
  const sinceMinutes =
    typeof opts.sinceMinutes === "number" && Number.isFinite(opts.sinceMinutes)
      ? opts.sinceMinutes
      : 60;
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.floor(opts.limit)
      : 200;
  const type = opts.type?.trim() || "mirror.nudge";
  const sinceTs = Date.now() - sinceMinutes * 60_000;

  const rows = queryTelemetryEvents(
    {
      type,
      runId: opts.runId,
      sinceTs,
      limit,
    },
    dbPath,
  );

  const events = rows
    .map((row) => parseIndexedPayload(row))
    .filter((evt): evt is NonNullable<typeof evt> => evt !== null);

  const summary = summarizeReflectEvents(events, {
    windowMinutes: sinceMinutes,
    runId: opts.runId,
    type,
    limit,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  process.stdout.write(formatReflectSummary(summary));
}

export async function runMirrorStatusCli(opts: MirrorStatusCliOptions): Promise<void> {
  const status = await getMirrorStatus({
    ndjsonPath: opts.ndjsonPath,
    dbPath: opts.db,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(status)}\n`);
    return;
  }

  process.stdout.write(formatMirrorStatusHuman(status));
}

export async function runMirrorDoctorCli(opts: MirrorDoctorCliOptions): Promise<void> {
  const report = await runMirrorDoctor({
    ndjsonPath: opts.ndjsonPath,
    dbPath: opts.db,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }

  process.stdout.write(formatMirrorDoctorHuman(report));
}

export async function runMirrorPassportCli(opts: MirrorPassportCliOptions): Promise<void> {
  const passport = buildMirrorPassport({
    includeLocal: opts.includeLocal === true,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(passport)}\n`);
    return;
  }

  process.stdout.write(formatMirrorPassport(passport));
}

export function registerMirrorTelemetryCli(program: Command): void {
  const mirror = program.command("mirror").description("Mirror diagnostics and telemetry tools");
  const telemetry = mirror.command("telemetry").description("Mirror telemetry commands");

  mirror
    .command("doctor")
    .description("Run read-only mirror runtime health checks")
    .option("--json", "Output machine-readable JSON", false)
    .option("--ndjson-path <path>", "Telemetry sink path (overrides env/default)")
    .option("--db <path>", "SQLite index path (overrides env/default)")
    .action(async (opts: { json?: boolean; ndjsonPath?: string; db?: string }) => {
      await runMirrorDoctorCli({
        json: opts.json === true,
        ndjsonPath: opts.ndjsonPath,
        db: opts.db,
      });
    });

  mirror
    .command("status")
    .description("Print mirror runtime status snapshot")
    .option("--json", "Output machine-readable JSON", false)
    .option("--ndjson-path <path>", "Telemetry sink path (overrides env/default)")
    .option("--db <path>", "SQLite index path (overrides env/default)")
    .action(async (opts: { json?: boolean; ndjsonPath?: string; db?: string }) => {
      await runMirrorStatusCli({
        json: opts.json === true,
        ndjsonPath: opts.ndjsonPath,
        db: opts.db,
      });
    });
  mirror
    .command("passport")
    .description("Print local mirror passport (agent identity)")
    .option("--json", "Output machine-readable JSON", false)
    .option("--include-local", "Include local-only traveler fields", false)
    .action(async (opts: { json?: boolean; includeLocal?: boolean }) => {
      await runMirrorPassportCli({
        json: opts.json === true,
        includeLocal: opts.includeLocal === true,
      });
    });

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

  telemetry
    .command("index")
    .description("Index telemetry NDJSON into SQLite for fast queries")
    .option("--path <ndjson>", "Telemetry source NDJSON path (overrides env/default)")
    .option("--db <sqlite>", "SQLite index path (overrides env/default)")
    .option("--rebuild", "Drop and recreate events table before indexing", false)
    .action(async (opts: { path?: string; db?: string; rebuild?: boolean }) => {
      await runMirrorTelemetryIndexCli({
        path: opts.path,
        db: opts.db,
        rebuild: opts.rebuild === true,
      });
    });

  telemetry
    .command("query")
    .description("Query telemetry events from SQLite index")
    .option("--type <eventType>", "Event type filter", "mirror.nudge")
    .option("--run-id <runId>", "Run ID filter")
    .option("--since <minutes>", "Include events newer than N minutes", parseSinceMinutes)
    .option("--limit <n>", "Maximum events to return", parseLimit, 50)
    .option("--json", "Output raw rows as JSON lines", false)
    .option("--db <sqlite>", "SQLite index path (overrides env/default)")
    .action(
      async (opts: {
        type?: string;
        runId?: string;
        since?: number;
        limit?: number;
        json?: boolean;
        db?: string;
      }) => {
        await runMirrorTelemetryQueryCli({
          type: opts.type,
          runId: opts.runId,
          sinceMinutes: opts.since,
          limit: opts.limit,
          json: opts.json === true,
          db: opts.db,
        });
      },
    );

  telemetry
    .command("reflect")
    .description("Summarize telemetry patterns from SQLite index")
    .option("--since <minutes>", "Include events newer than N minutes", parseSinceMinutes, 60)
    .option("--limit <n>", "Maximum events to scan", parseLimit, 200)
    .option("--run-id <runId>", "Run ID filter")
    .option("--type <eventType>", "Event type filter", "mirror.nudge")
    .option("--json", "Output structured summary JSON", false)
    .option("--db <sqlite>", "SQLite index path (overrides env/default)")
    .action(
      async (opts: {
        since?: number;
        limit?: number;
        runId?: string;
        type?: string;
        json?: boolean;
        db?: string;
      }) => {
        await runMirrorTelemetryReflectCli({
          sinceMinutes: opts.since,
          limit: opts.limit,
          runId: opts.runId,
          type: opts.type,
          json: opts.json === true,
          db: opts.db,
        });
      },
    );
}
