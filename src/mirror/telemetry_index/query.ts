import { openTelemetryIndexDb } from "./db.js";

export type IndexedEventRow = {
  id: number;
  ts: number;
  type: string;
  run_id: string | null;
  payload_json: string;
};

function withDb<T>(
  dbPath: string | undefined,
  fn: (db: import("node:sqlite").DatabaseSync) => T,
): T {
  const db = openTelemetryIndexDb({ dbPath });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function getRecentEvents(limit = 50, dbPath?: string): IndexedEventRow[] {
  return withDb(
    dbPath,
    (db) =>
      db
        .prepare(
          "SELECT id, ts, type, run_id, payload_json FROM events ORDER BY ts DESC, id DESC LIMIT ?",
        )
        .all(limit) as IndexedEventRow[],
  );
}

export function getEventsByType(type: string, limit = 50, dbPath?: string): IndexedEventRow[] {
  return withDb(
    dbPath,
    (db) =>
      db
        .prepare(
          "SELECT id, ts, type, run_id, payload_json FROM events WHERE type = ? ORDER BY ts DESC, id DESC LIMIT ?",
        )
        .all(type, limit) as IndexedEventRow[],
  );
}

export function getEventsSince(ts: number, dbPath?: string): IndexedEventRow[] {
  return withDb(
    dbPath,
    (db) =>
      db
        .prepare(
          "SELECT id, ts, type, run_id, payload_json FROM events WHERE ts >= ? ORDER BY ts ASC, id ASC",
        )
        .all(ts) as IndexedEventRow[],
  );
}

export function countEventsByType(dbPath?: string): Array<{ type: string; count: number }> {
  return withDb(
    dbPath,
    (db) =>
      db
        .prepare("SELECT type, COUNT(*) as count FROM events GROUP BY type ORDER BY type ASC")
        .all() as Array<{ type: string; count: number }>,
  );
}

export function getLastEvent(dbPath?: string): IndexedEventRow | null {
  return withDb(
    dbPath,
    (db) =>
      (db
        .prepare(
          "SELECT id, ts, type, run_id, payload_json FROM events ORDER BY ts DESC, id DESC LIMIT 1",
        )
        .get() as IndexedEventRow | undefined) ?? null,
  );
}
