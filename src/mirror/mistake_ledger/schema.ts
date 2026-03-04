/**
 * Memory / Mistake Ledger v1 — SQLite Schema
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

const SCHEMA_VERSION = 1;
const TABLE_NAME = "ledger_events";

type SqliteDb = Pick<BetterSqliteDatabase, "prepare" | "exec" | "pragma">;

export function initSchema(db: SqliteDb): void {
  const tableExists =
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(TABLE_NAME) !==
    undefined;

  if (!tableExists) {
    db.exec(`
      CREATE TABLE ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('memory', 'mistake', 'decision')),
        run_id TEXT,
        tool_name TEXT,
        agent_id TEXT,
        user_id TEXT,
        session_id TEXT,
        severity TEXT NOT NULL CHECK(severity IN ('info', 'warn', 'error')),
        title TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        tags_json TEXT,
        source TEXT NOT NULL CHECK(source IN ('user', 'agent', 'system')),
        related_id TEXT,
        hash TEXT NOT NULL
      );
    `);

    db.exec(`
      CREATE INDEX idx_ledger_ts ON ${TABLE_NAME}(ts);
      CREATE INDEX idx_ledger_kind_ts ON ${TABLE_NAME}(kind, ts);
      CREATE INDEX idx_ledger_runid_ts ON ${TABLE_NAME}(run_id, ts);
    `);

    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }

  const version = db.pragma("user_version", { simple: true }) as number;
  if (version !== SCHEMA_VERSION) {
    console.warn(
      `[MistakeLedger] Schema version mismatch: current=${version}, expected=${SCHEMA_VERSION}`,
    );
  }
}

export function getSchemaVersion(db: SqliteDb): number {
  return db.pragma("user_version", { simple: true }) as number;
}
