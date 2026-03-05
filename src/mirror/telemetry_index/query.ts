import { openTelemetryIndexDb } from "./db.js";

export type IndexedEventRow = {
  id: number;
  ts: number;
  type: string;
  run_id: string | null;
  payload_json: string;
};

export type TelemetryQueryOptions = {
  type?: string;
  runId?: string;
  sinceTs?: number;
  limit?: number;
};

export type ParsedTelemetryEnvelope = {
  stream: string;
  data: Record<string, unknown>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseIndexedPayload(row: IndexedEventRow): ParsedTelemetryEnvelope | null {
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.stream === "string" && isRecord(parsed.data)) {
      return {
        stream: parsed.stream,
        data: parsed.data,
      };
    }
    if (isRecord(parsed) && typeof parsed.type === "string") {
      return {
        stream: "telemetry",
        data: parsed,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function queryTelemetryEvents(
  options: TelemetryQueryOptions,
  dbPath?: string,
): IndexedEventRow[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options.type && options.type.trim()) {
    clauses.push("type = ?");
    params.push(options.type.trim());
  }
  if (options.runId && options.runId.trim()) {
    clauses.push("run_id = ?");
    params.push(options.runId.trim());
  }
  if (typeof options.sinceTs === "number" && Number.isFinite(options.sinceTs)) {
    clauses.push("ts >= ?");
    params.push(options.sinceTs);
  }

  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 50;

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql =
    `SELECT id, ts, type, run_id, payload_json FROM events ${where} ` +
    "ORDER BY ts DESC, id DESC LIMIT ?";

  return withDb(dbPath, (db) => db.prepare(sql).all(...params, limit) as IndexedEventRow[]);
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
