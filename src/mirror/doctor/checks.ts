import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { openTelemetryIndexDb, resolveMirrorTelemetryIndexDbPath } from "../telemetry_index/db.js";
import { resolveMirrorTelemetrySinkPath } from "../telemetry_sinks/ndjson_sink.js";

export type MirrorDoctorCheckStatus = "PASS" | "WARN" | "FAIL";

export type MirrorDoctorCheck = {
  key: string;
  status: MirrorDoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type MirrorDoctorCheckOptions = {
  env?: NodeJS.ProcessEnv;
  ndjsonPath?: string;
  dbPath?: string;
  openDb?: (dbPath: string) => import("node:sqlite").DatabaseSync;
};

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function boolFromEnv(env: NodeJS.ProcessEnv, key: string): boolean {
  return env[key] === "1";
}

function detectAgentId(env: NodeJS.ProcessEnv): string | undefined {
  const keys = ["MIRROR_AGENT_ID", "OPENCLAW_AGENT_ID", "OPENCLAW_AGENT"];
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function detectRunId(env: NodeJS.ProcessEnv): string | undefined {
  const keys = ["MIRROR_RUN_ID", "OPENCLAW_RUN_ID"];
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

async function canAccess(filePath: string, mode: number): Promise<boolean> {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(filePath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function check(
  status: MirrorDoctorCheckStatus,
  key: string,
  message: string,
  details?: Record<string, unknown>,
): MirrorDoctorCheck {
  return { key, status, message, details };
}

export async function runMirrorDoctorChecks(
  opts: MirrorDoctorCheckOptions = {},
): Promise<MirrorDoctorCheck[]> {
  const env = opts.env ?? process.env;
  const checks: MirrorDoctorCheck[] = [];

  const telemetryEnabled = boolFromEnv(env, "MIRROR_TELEMETRY_ENABLED");
  const sinkEnabled = boolFromEnv(env, "MIRROR_TELEMETRY_SINK_ENABLED");
  const passportEnabled = boolFromEnv(env, "MIRROR_PASSPORT_TELEMETRY_ENABLED");
  const privacyEnabled = boolFromEnv(env, "MIRROR_PRIVACY_BOUNDARY_ENABLED");

  const sinkPath = resolvePath(
    opts.ndjsonPath?.trim() ? opts.ndjsonPath.trim() : resolveMirrorTelemetrySinkPath(env),
  );
  const dbPath = resolvePath(
    opts.dbPath?.trim() ? opts.dbPath.trim() : resolveMirrorTelemetryIndexDbPath(env),
  );

  checks.push(
    check(
      telemetryEnabled ? "PASS" : "WARN",
      "telemetry.enabled",
      `MIRROR_TELEMETRY_ENABLED=${telemetryEnabled ? "1" : "0"}`,
      { enabled: telemetryEnabled },
    ),
  );
  checks.push(
    check(
      sinkEnabled ? "PASS" : "WARN",
      "telemetry.sinkEnabled",
      `MIRROR_TELEMETRY_SINK_ENABLED=${sinkEnabled ? "1" : "0"}`,
      { enabled: sinkEnabled },
    ),
  );
  checks.push(check("PASS", "sink.path", sinkPath, { path: sinkPath }));
  checks.push(check("PASS", "sqlite.path", dbPath, { path: dbPath }));

  const sinkStat = await statSafe(sinkPath);
  if (!sinkStat || !sinkStat.isFile()) {
    checks.push(
      check("WARN", "sink.file", "file missing (will be created on first write)", {
        exists: false,
      }),
    );
  } else {
    const sinkReadable = await canAccess(sinkPath, constants.R_OK);
    if (sinkReadable) {
      checks.push(check("PASS", "sink.file", "file exists and readable", { exists: true }));
    } else {
      checks.push(
        check(sinkEnabled ? "FAIL" : "WARN", "sink.file", "file exists but is not readable", {
          exists: true,
          readable: false,
        }),
      );
    }

    checks.push(
      check(
        sinkStat.size > 0 ? "PASS" : "WARN",
        "sink.size",
        sinkStat.size > 0 ? `size=${sinkStat.size} bytes` : "file is empty",
        { bytes: sinkStat.size },
      ),
    );
  }

  const sinkParent = path.dirname(sinkPath);
  const parentStat = await statSafe(sinkParent);
  if (!parentStat || !parentStat.isDirectory()) {
    checks.push(
      check(sinkEnabled ? "FAIL" : "WARN", "sink.parentDir", `directory missing: ${sinkParent}`, {
        directory: sinkParent,
        exists: false,
      }),
    );
  } else {
    const parentWritable = await canAccess(sinkParent, constants.W_OK);
    checks.push(
      check(
        parentWritable ? "PASS" : sinkEnabled ? "FAIL" : "WARN",
        "sink.parentDir",
        parentWritable ? `writable: ${sinkParent}` : `not writable: ${sinkParent}`,
        { directory: sinkParent, writable: parentWritable },
      ),
    );
  }

  const dbStat = await statSafe(dbPath);
  if (!dbStat || !dbStat.isFile()) {
    checks.push(check("WARN", "sqlite.db", "file missing", { exists: false }));
  } else {
    const dbReadable = await canAccess(dbPath, constants.R_OK);
    checks.push(
      check(
        dbReadable ? "PASS" : telemetryEnabled ? "FAIL" : "WARN",
        "sqlite.db",
        dbReadable ? "file exists and readable" : "file exists but is not readable",
        { exists: true, readable: dbReadable },
      ),
    );

    const openDb =
      opts.openDb ?? ((resolvedPath: string) => openTelemetryIndexDb({ dbPath: resolvedPath }));
    let db: import("node:sqlite").DatabaseSync | undefined;
    try {
      db = openDb(dbPath);
      const row = db.prepare("SELECT COUNT(*) as count FROM events").get() as
        | { count?: number }
        | undefined;
      const count = typeof row?.count === "number" && Number.isFinite(row.count) ? row.count : 0;
      checks.push(check("PASS", "sqlite.events", `${count} events`, { count }));
    } catch (err) {
      checks.push(
        check("FAIL", "sqlite.events", "query failed (SELECT COUNT(*) FROM events)", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      db?.close();
    }
  }

  checks.push(
    check(
      passportEnabled ? "PASS" : "WARN",
      "passport.telemetry",
      passportEnabled ? "enabled" : "disabled",
      { enabled: passportEnabled },
    ),
  );
  checks.push(
    check(
      privacyEnabled ? "PASS" : "WARN",
      "privacy.boundary",
      privacyEnabled ? "enabled" : "disabled",
      { enabled: privacyEnabled },
    ),
  );

  const agentId = detectAgentId(env);
  const runId = detectRunId(env);
  checks.push(
    check(
      agentId ? "PASS" : "WARN",
      "identity.agentId",
      agentId ? "detected" : "not detected",
      agentId ? { agentId } : undefined,
    ),
  );
  checks.push(
    check(
      runId ? "PASS" : "WARN",
      "identity.runId",
      runId ? "detected" : "not detected",
      runId ? { runId } : undefined,
    ),
  );

  return checks;
}
