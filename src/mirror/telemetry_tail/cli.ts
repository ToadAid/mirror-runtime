// Active source of truth for `openclaw mirror ...` subcommands.
import type { Command } from "commander";
import { registerMirrorApiCli } from "../../mirror-daemon/api-cli.js";
import { formatMirrorDaemonCliError } from "../../mirror-daemon/cli-errors.js";
import {
  getMirrorProviderHealth,
  getMirrorRun,
  getMirrorProviderStatus,
  listMirrorJournal,
  getOceanEvidence,
  listMirrorRuns,
  type MirrorApiProviderStatusResponse,
  type MirrorApiRunStatus,
} from "../../mirror-daemon/client.js";
import { formatMirrorDoctorHuman, runMirrorDoctor } from "../doctor/index.js";
import { runVerifyLoreCli } from "../lore_manifest/index.js";
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

export type MirrorJournalTailCliOptions = {
  json?: boolean;
  limit?: number;
  type?: string;
  traceId?: string;
  baseUrl?: string;
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

export type MirrorVerifyLoreCliOptions = {
  manifest?: string;
  dir?: string;
  json?: boolean;
};

export type MirrorRunsListCliOptions = {
  limit?: number;
  callerAgent?: string;
  status?: MirrorApiRunStatus;
  baseUrl?: string;
  json?: boolean;
};

export type MirrorRunsShowCliOptions = {
  id: string;
  baseUrl?: string;
  json?: boolean;
};

export type MirrorOceanEvidenceCliOptions = {
  pondId: string;
  baseUrl?: string;
  json?: boolean;
};

export type MirrorProviderStatusCliOptions = {
  baseUrl?: string;
  json?: boolean;
};

export type MirrorProviderHealthCliOptions = {
  baseUrl?: string;
  json?: boolean;
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

function parseRunStatus(raw: string): MirrorApiRunStatus {
  if (raw === "completed" || raw === "failed" || raw === "partial" || raw === "pending") {
    return raw;
  }
  throw new Error("status must be one of: completed, failed, partial, pending");
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

export async function runMirrorVerifyLoreCli(opts: MirrorVerifyLoreCliOptions): Promise<void> {
  await runVerifyLoreCli({
    manifestPath: opts.manifest,
    dir: opts.dir,
    json: opts.json === true,
  });
}

export async function runMirrorRunsListCli(opts: MirrorRunsListCliOptions): Promise<void> {
  try {
    const payload = await listMirrorRuns(
      {
        limit: opts.limit,
        callerAgent: opts.callerAgent,
        status: opts.status,
      },
      { baseUrl: opts.baseUrl },
    );
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    for (const run of payload.runs) {
      const parts = [
        run.trace_id,
        run.status,
        run.caller_agent ?? "-",
        `tools=${run.tool_count}`,
        `approvals=${run.approval_count}`,
        run.ended_at,
      ];
      process.stdout.write(`${parts.join(" | ")}\n`);
    }
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror runs list", error);
  }
}

export async function runMirrorRunsShowCli(opts: MirrorRunsShowCliOptions): Promise<void> {
  try {
    const payload = await getMirrorRun(opts.id, { baseUrl: opts.baseUrl });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }

    const summary = payload.summary;
    const header = [
      `trace_id: ${summary.trace_id}`,
      `status: ${summary.status}`,
      `caller_agent: ${summary.caller_agent ?? "-"}`,
      `started_at: ${summary.started_at}`,
      `ended_at: ${summary.ended_at}`,
      `tool_count: ${summary.tool_count}`,
      `approval_count: ${summary.approval_count}`,
      `last_event_type: ${summary.last_event_type}`,
      "",
    ];
    process.stdout.write(`${header.join("\n")}\n`);
    for (const event of payload.events) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror runs show", error);
  }
}

export async function runMirrorOceanEvidenceCli(
  opts: MirrorOceanEvidenceCliOptions,
): Promise<void> {
  try {
    const payload = await getOceanEvidence(opts.pondId, { baseUrl: opts.baseUrl });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    const lines = [
      `pond_id: ${payload.pond_id}`,
      `name: ${payload.name ?? "-"}`,
      `manifest_url: ${payload.manifest_url ?? "-"}`,
      `trust_status: ${payload.trust_status ?? "-"}`,
      `pubkey_id: ${payload.pubkey_id ?? "-"}`,
      `signature_ok: ${payload.signature_ok === true ? "true" : payload.signature_ok === false ? "false" : "-"}`,
      `last_handshake_at: ${payload.last_handshake_at ?? "-"}`,
      `last_consult_at: ${payload.last_consult_at ?? "-"}`,
      `last_consult_ok: ${payload.last_consult_ok === true ? "true" : payload.last_consult_ok === false ? "false" : "-"}`,
      `remote_runtime: ${payload.remote_runtime ?? "-"}`,
      `remote_ocean_protocol: ${payload.remote_ocean_protocol ?? "-"}`,
      `last_error: ${payload.last_error ?? "-"}`,
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror ocean evidence", error);
  }
}

export async function runMirrorJournalTailCli(opts: MirrorJournalTailCliOptions): Promise<void> {
  try {
    const payload = await listMirrorJournal(
      {
        limit: opts.limit ?? 20,
        type: opts.type,
        traceId: opts.traceId,
      },
      { baseUrl: opts.baseUrl },
    );
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    for (const entry of payload.entries) {
      const parts = [
        entry.ts,
        entry.event_type,
        entry.tool_name ?? "-",
        entry.trace_id,
        entry.reason ?? "",
      ].filter((value) => value && value.trim().length > 0);
      process.stdout.write(`${parts.join(" | ")}\n`);
    }
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror journal tail", error);
  }
}

function formatProviderStatusHuman(payload: MirrorApiProviderStatusResponse): string {
  const evidence = payload.evidence;
  const invocation = payload.invocation_summary;
  const lines = [
    `provider: ${payload.provider}`,
    `default_model: ${payload.default_model}`,
    `adapter: ${payload.adapter ?? "-"}`,
    `runtime_snapshot: ${payload.source.runtime_snapshot ? "true" : "false"}`,
    `MIRROR_PROVIDER: ${payload.provider_env.MIRROR_PROVIDER}`,
    `MIRROR_PROVIDER_MODEL: ${payload.provider_env.MIRROR_PROVIDER_MODEL}`,
    `effective_provider: ${evidence?.effective_provider ?? payload.provider}`,
    `effective_model: ${evidence?.effective_model ?? payload.default_model}`,
    `alias_normalized_from: ${evidence?.alias_normalized_from ?? "-"}`,
    `auth_source: ${evidence?.auth_source ?? "-"}`,
    `credential_resolution_attempted: ${evidence?.credential_resolution_attempted === true ? "true" : "false"}`,
    `credential_resolution_ok: ${evidence?.credential_resolution_ok === true ? "true" : evidence?.credential_resolution_ok === false ? "false" : "-"}`,
    `last_error: ${evidence?.last_error ?? "-"}`,
    `last_invoked_at: ${invocation?.last_invoked_at ?? "-"}`,
    `last_provider: ${invocation?.last_provider ?? "-"}`,
    `last_model: ${invocation?.last_model ?? "-"}`,
    `last_outcome: ${invocation?.last_outcome ?? "-"}`,
    `last_invocation_error: ${invocation?.last_error ?? "-"}`,
  ];
  return `${lines.join("\n")}\n`;
}

export async function runMirrorProviderStatusCli(
  opts: MirrorProviderStatusCliOptions,
): Promise<void> {
  try {
    const payload = await getMirrorProviderStatus({ baseUrl: opts.baseUrl });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    process.stdout.write(formatProviderStatusHuman(payload));
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror provider status", error);
  }
}

function formatProviderHealthHuman(payload: {
  provider: string;
  model: string;
  configured: boolean;
  reachable: boolean;
  ok: boolean;
  error?: string;
  source: { runtime_snapshot: boolean };
  invocation_summary?: {
    last_invoked_at: string;
    last_provider: string;
    last_model: string;
    last_outcome: "ok" | "error";
    last_error?: string;
  } | null;
  evidence?: {
    effective_provider: string;
    effective_model: string;
    alias_normalized_from?: string;
    auth_source: "configured_token" | "resolved_credentials" | "none";
    credential_resolution_attempted: boolean;
    credential_resolution_ok?: boolean;
    last_error?: string;
  };
}): string {
  const evidence = payload.evidence;
  const invocation = payload.invocation_summary;
  const lines = [
    `provider: ${payload.provider}`,
    `model: ${payload.model}`,
    `configured: ${payload.configured ? "true" : "false"}`,
    `reachable: ${payload.reachable ? "true" : "false"}`,
    `ok: ${payload.ok ? "true" : "false"}`,
    `error: ${payload.error ?? "-"}`,
    `runtime_snapshot: ${payload.source.runtime_snapshot ? "true" : "false"}`,
    `effective_provider: ${evidence?.effective_provider ?? payload.provider}`,
    `effective_model: ${evidence?.effective_model ?? payload.model}`,
    `alias_normalized_from: ${evidence?.alias_normalized_from ?? "-"}`,
    `auth_source: ${evidence?.auth_source ?? "-"}`,
    `credential_resolution_attempted: ${evidence?.credential_resolution_attempted === true ? "true" : "false"}`,
    `credential_resolution_ok: ${evidence?.credential_resolution_ok === true ? "true" : evidence?.credential_resolution_ok === false ? "false" : "-"}`,
    `last_error: ${evidence?.last_error ?? "-"}`,
    `last_invoked_at: ${invocation?.last_invoked_at ?? "-"}`,
    `last_provider: ${invocation?.last_provider ?? "-"}`,
    `last_model: ${invocation?.last_model ?? "-"}`,
    `last_outcome: ${invocation?.last_outcome ?? "-"}`,
    `last_invocation_error: ${invocation?.last_error ?? "-"}`,
  ];
  return `${lines.join("\n")}\n`;
}

export async function runMirrorProviderHealthCli(
  opts: MirrorProviderHealthCliOptions,
): Promise<void> {
  try {
    const payload = await getMirrorProviderHealth({ baseUrl: opts.baseUrl });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    process.stdout.write(formatProviderHealthHuman(payload));
  } catch (error) {
    throw formatMirrorDaemonCliError("mirror provider health", error);
  }
}

export function registerMirrorTelemetryCli(program: Command): void {
  const mirror = program.command("mirror").description("Mirror diagnostics and telemetry tools");
  const telemetry = mirror.command("telemetry").description("Mirror telemetry commands");
  const runs = mirror.command("runs").description("Mirror run history (via MirrorDaemon)");
  const ocean = mirror.command("ocean").description("Mirror ocean operator commands");
  const provider = mirror.command("provider").description("Mirror provider operator commands");
  registerMirrorApiCli(mirror);
  mirror
    .command("journal")
    .description("Mirror journal commands")
    .command("tail")
    .description("Read Mirror run journal from MirrorDaemon")
    .option("--json", "Output machine-readable JSON", false)
    .option("--limit <n>", "Number of journal entries", parseLimit, 20)
    .option("--type <eventType>", "Filter by event type")
    .option("--trace-id <traceId>", "Filter by trace id")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .action(
      async (opts: {
        json?: boolean;
        limit?: number;
        type?: string;
        traceId?: string;
        baseUrl?: string;
      }) => {
        await runMirrorJournalTailCli({
          json: opts.json === true,
          limit: opts.limit,
          type: opts.type,
          traceId: opts.traceId,
          baseUrl: opts.baseUrl,
        });
      },
    );

  runs
    .command("list")
    .description("List derived run summaries from MirrorDaemon")
    .option("--limit <n>", "Maximum runs to return", parseLimit, 20)
    .option("--caller-agent <agent>", "Filter by caller agent")
    .option("--status <status>", "Filter by run status", parseRunStatus)
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output machine-readable JSON", false)
    .action(
      async (opts: {
        limit?: number;
        callerAgent?: string;
        status?: MirrorApiRunStatus;
        baseUrl?: string;
        json?: boolean;
      }) => {
        await runMirrorRunsListCli({
          limit: opts.limit,
          callerAgent: opts.callerAgent,
          status: opts.status,
          baseUrl: opts.baseUrl,
          json: opts.json === true,
        });
      },
    );

  runs
    .command("show")
    .description("Show one run summary and events from MirrorDaemon")
    .argument("<id>", "Run id (v0: trace_id)")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (id: string, opts: { baseUrl?: string; json?: boolean }) => {
      await runMirrorRunsShowCli({
        id,
        baseUrl: opts.baseUrl,
        json: opts.json === true,
      });
    });

  ocean
    .command("evidence")
    .description("Show trust/evidence details for one ocean pond")
    .argument("<pond_id>", "Pond ID")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (pondId: string, opts: { baseUrl?: string; json?: boolean }) => {
      await runMirrorOceanEvidenceCli({
        pondId,
        baseUrl: opts.baseUrl,
        json: opts.json === true,
      });
    });

  provider
    .command("status")
    .description("Show Mirror provider configuration/status from MirrorDaemon")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts: { baseUrl?: string; json?: boolean }) => {
      await runMirrorProviderStatusCli({
        baseUrl: opts.baseUrl,
        json: opts.json === true,
      });
    });

  provider
    .command("health")
    .description("Probe current Mirror provider configuration via MirrorDaemon")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts: { baseUrl?: string; json?: boolean }) => {
      await runMirrorProviderHealthCli({
        baseUrl: opts.baseUrl,
        json: opts.json === true,
      });
    });

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

  mirror
    .command("verify-lore")
    .description("Verify canonical lore scrolls against a lore manifest")
    .option("--manifest <path>", "Lore manifest path", "lore/manifest.json")
    .option("--dir <path>", "Canonical lore directory", "lore/canonical")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts: { manifest?: string; dir?: string; json?: boolean }) => {
      await runMirrorVerifyLoreCli({
        manifest: opts.manifest,
        dir: opts.dir,
        json: opts.json === true,
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
