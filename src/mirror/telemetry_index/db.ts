import { mkdirSync } from "node:fs";
import path from "node:path";
import { requireNodeSqlite } from "../../memory/sqlite.js";

export const DEFAULT_MIRROR_TELEMETRY_INDEX_DB_PATH = "./db/mirror-telemetry.sqlite";

export type TelemetryIndexDb = import("node:sqlite").DatabaseSync;

export function resolveMirrorTelemetryIndexDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MIRROR_TELEMETRY_INDEX_DB_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_MIRROR_TELEMETRY_INDEX_DB_PATH;
}

export function ensureTelemetryIndexSchema(db: TelemetryIndexDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      run_id TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts
    ON events(ts);

    CREATE INDEX IF NOT EXISTS idx_events_type_ts
    ON events(type, ts);

    CREATE INDEX IF NOT EXISTS idx_events_run_id
    ON events(run_id);
  `);
}

export function openTelemetryIndexDb(params?: {
  dbPath?: string;
  rebuild?: boolean;
}): TelemetryIndexDb {
  const dbPath = path.resolve(params?.dbPath ?? resolveMirrorTelemetryIndexDbPath(process.env));
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  if (params?.rebuild) {
    db.exec("DROP TABLE IF EXISTS events;");
  }
  ensureTelemetryIndexSchema(db);
  return db;
}
