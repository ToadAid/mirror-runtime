import fs from "node:fs/promises";
import path from "node:path";
import { openTelemetryIndexDb, resolveMirrorTelemetryIndexDbPath } from "../telemetry_index/db.js";
import {
  resolveMirrorTelemetrySinkLockEnabled,
  resolveMirrorTelemetrySinkLockPath,
  resolveMirrorTelemetrySinkPath,
  resolveMirrorTelemetrySinkRotateBytes,
  resolveMirrorTelemetrySinkRotateKeep,
} from "../telemetry_sinks/ndjson_sink.js";

export type MirrorStatus = {
  ts: string;
  cwd: string;
  telemetry: {
    enabled: boolean;
    sinkEnabled: boolean;
    sinkPath: string;
    rotateBytes: number;
    rotateKeep: number;
    lockEnabled: boolean;
    lockPath: string;
    indexDbPath: string;
  };
  passport: {
    cliAvailable: true;
    telemetryEnabled: boolean;
  };
  privacy: {
    boundaryGuard: boolean;
  };
  storage: {
    ndjsonExists: boolean;
    ndjsonBytes?: number;
    sqliteExists: boolean;
    sqliteEvents?: number | null;
  };
};

export type GetMirrorStatusOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  now?: Date;
  ndjsonPath?: string;
  dbPath?: string;
  openDb?: (dbPath: string) => import("node:sqlite").DatabaseSync;
};

async function statSafe(filePath: string): Promise<{ exists: boolean; size?: number }> {
  try {
    const stats = await fs.stat(filePath);
    return {
      exists: stats.isFile(),
      size: stats.size,
    };
  } catch {
    return { exists: false };
  }
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(inputPath);
}

function resolveStatusPaths(opts: GetMirrorStatusOptions): { sinkPath: string; dbPath: string } {
  const env = opts.env ?? process.env;
  const sinkPath =
    opts.ndjsonPath?.trim() && opts.ndjsonPath.trim().length > 0
      ? opts.ndjsonPath.trim()
      : resolveMirrorTelemetrySinkPath(env);
  const dbPath =
    opts.dbPath?.trim() && opts.dbPath.trim().length > 0
      ? opts.dbPath.trim()
      : resolveMirrorTelemetryIndexDbPath(env);
  return {
    sinkPath: resolvePath(sinkPath),
    dbPath: resolvePath(dbPath),
  };
}

function querySqliteEventsSafe(params: {
  dbPath: string;
  openDb?: (dbPath: string) => import("node:sqlite").DatabaseSync;
}): number | null {
  const openDb = params.openDb ?? ((dbPath: string) => openTelemetryIndexDb({ dbPath }));

  let db: import("node:sqlite").DatabaseSync | undefined;
  try {
    db = openDb(params.dbPath);
    const row = db.prepare("SELECT COUNT(*) as count FROM events").get() as
      | { count?: number }
      | undefined;
    return typeof row?.count === "number" && Number.isFinite(row.count) ? row.count : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function getMirrorStatus(opts: GetMirrorStatusOptions = {}): Promise<MirrorStatus> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const cwd = opts.cwd ?? process.cwd();
  const { sinkPath, dbPath } = resolveStatusPaths(opts);

  const [ndjsonStat, sqliteStat] = await Promise.all([statSafe(sinkPath), statSafe(dbPath)]);

  const storage: MirrorStatus["storage"] = {
    ndjsonExists: ndjsonStat.exists,
    sqliteExists: sqliteStat.exists,
  };

  if (typeof ndjsonStat.size === "number") {
    storage.ndjsonBytes = ndjsonStat.size;
  }

  if (sqliteStat.exists) {
    storage.sqliteEvents = querySqliteEventsSafe({ dbPath, openDb: opts.openDb });
  }

  return {
    ts: now.toISOString(),
    cwd,
    telemetry: {
      enabled: env.MIRROR_TELEMETRY_ENABLED === "1",
      sinkEnabled: env.MIRROR_TELEMETRY_SINK_ENABLED === "1",
      sinkPath,
      rotateBytes: resolveMirrorTelemetrySinkRotateBytes(env),
      rotateKeep: resolveMirrorTelemetrySinkRotateKeep(env),
      lockEnabled: resolveMirrorTelemetrySinkLockEnabled(env),
      lockPath: resolveMirrorTelemetrySinkLockPath({ filePath: sinkPath, env }),
      indexDbPath: dbPath,
    },
    passport: {
      cliAvailable: true,
      telemetryEnabled: env.MIRROR_PASSPORT_TELEMETRY_ENABLED === "1",
    },
    privacy: {
      boundaryGuard: true,
    },
    storage,
  };
}
