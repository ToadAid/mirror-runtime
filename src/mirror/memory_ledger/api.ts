/**
 * Memory / Mistake Ledger v1 — API
 */

import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getLedgerDb, isLedgerEnabled } from "./db.js";
import type {
  AddMemoryEventResult,
  AddMistakeEventResult,
  MemoryEvent,
  MemoryKind,
  MistakeCategory,
  MistakeEvent,
  MistakeSeverity,
} from "./types.js";

type MemoryEventInput = {
  kind: MemoryKind;
  key: string;
  value_json: Record<string, unknown>;
  user_id?: string;
  session_id?: string;
  source?: string;
  confidence?: number;
  tags_json?: string;
};

type MemoryEventFilters = {
  user_id?: string;
  session_id?: string;
  kind?: MemoryKind;
  key?: string;
  limit?: number;
  since_ts?: number;
};

type MistakeEventInput = {
  category: MistakeCategory;
  summary: string;
  expected?: string;
  actual?: string;
  tool_name?: string;
  run_id?: string;
  severity: MistakeSeverity;
  notes?: string;
};

type MistakeEventFilters = {
  resolved?: number;
  tool_name?: string;
  category?: MistakeCategory;
  severity?: MistakeSeverity;
  limit?: number;
};

function resolveDb(db?: Database.Database): Database.Database | null {
  if (!isLedgerEnabled() && !db) {
    return null;
  }
  return db ?? getLedgerDb();
}

export function addMemoryEvent(
  db: Database.Database,
  event: MemoryEventInput,
): AddMemoryEventResult;
export function addMemoryEvent(event: MemoryEventInput): AddMemoryEventResult;
export function addMemoryEvent(
  dbOrEvent: Database.Database | MemoryEventInput,
  maybeEvent?: MemoryEventInput,
): AddMemoryEventResult {
  const database = resolveDb(maybeEvent ? (dbOrEvent as Database.Database) : undefined);
  if (!database) {
    return { event_id: "", is_duplicate: false };
  }
  const event = (maybeEvent ?? dbOrEvent) as MemoryEventInput;
  const id = crypto.randomUUID();
  const ts = Date.now();

  database
    .prepare(
      "INSERT INTO memory_events (id, ts, user_id, session_id, kind, key, value_json, source, confidence, tags_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      ts,
      event.user_id ?? null,
      event.session_id ?? null,
      event.kind,
      event.key,
      JSON.stringify(event.value_json),
      event.source ?? null,
      event.confidence ?? null,
      event.tags_json ?? null,
    );

  return { event_id: id, is_duplicate: false };
}

export function listMemoryEvents(
  db: Database.Database,
  filters?: MemoryEventFilters,
): MemoryEvent[];
export function listMemoryEvents(filters?: MemoryEventFilters): MemoryEvent[];
export function listMemoryEvents(
  dbOrFilters?: Database.Database | MemoryEventFilters,
  maybeFilters?: MemoryEventFilters,
): MemoryEvent[] {
  const database = resolveDb(dbOrFilters && "prepare" in dbOrFilters ? dbOrFilters : undefined);
  if (!database) {
    return [];
  }
  const filters =
    dbOrFilters && "prepare" in dbOrFilters ? maybeFilters : (dbOrFilters as MemoryEventFilters);

  let sql = "SELECT * FROM memory_events WHERE 1=1";
  const params: unknown[] = [];

  if (filters?.user_id) {
    sql += " AND user_id = ?";
    params.push(filters.user_id);
  }
  if (filters?.session_id) {
    sql += " AND session_id = ?";
    params.push(filters.session_id);
  }
  if (filters?.kind) {
    sql += " AND kind = ?";
    params.push(filters.kind);
  }
  if (filters?.key) {
    sql += " AND key = ?";
    params.push(filters.key);
  }
  if (filters?.since_ts) {
    sql += " AND ts >= ?";
    params.push(filters.since_ts);
  }
  sql += " ORDER BY ts DESC";

  if (filters?.limit) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    ts: Number(row.ts),
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    session_id: typeof row.session_id === "string" ? row.session_id : null,
    kind: row.kind as MemoryKind,
    key: String(row.key),
    value_json:
      typeof row.value_json === "string"
        ? (JSON.parse(row.value_json) as Record<string, unknown>)
        : {},
    source: typeof row.source === "string" ? row.source : null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    tags_json: typeof row.tags_json === "string" ? row.tags_json : "[]",
  }));
}

export function addMistakeEvent(
  db: Database.Database,
  event: MistakeEventInput,
): AddMistakeEventResult;
export function addMistakeEvent(event: MistakeEventInput): AddMistakeEventResult;
export function addMistakeEvent(
  dbOrEvent: Database.Database | MistakeEventInput,
  maybeEvent?: MistakeEventInput,
): AddMistakeEventResult {
  const database = resolveDb(maybeEvent ? (dbOrEvent as Database.Database) : undefined);
  if (!database) {
    return { event_id: "", is_duplicate: false };
  }
  const event = (maybeEvent ?? dbOrEvent) as MistakeEventInput;
  const id = crypto.randomUUID();
  const ts = Date.now();

  database
    .prepare(
      "INSERT INTO mistake_events (id, ts, run_id, tool_name, category, summary, expected, actual, severity, resolved, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      ts,
      event.run_id ?? null,
      event.tool_name ?? null,
      event.category,
      event.summary,
      event.expected ?? null,
      event.actual ?? null,
      event.severity,
      0,
      event.notes ?? null,
    );

  return { event_id: id, is_duplicate: false };
}

export function listMistakeEvents(
  db: Database.Database,
  filters?: MistakeEventFilters,
): MistakeEvent[];
export function listMistakeEvents(filters?: MistakeEventFilters): MistakeEvent[];
export function listMistakeEvents(
  dbOrFilters?: Database.Database | MistakeEventFilters,
  maybeFilters?: MistakeEventFilters,
): MistakeEvent[] {
  const database = resolveDb(dbOrFilters && "prepare" in dbOrFilters ? dbOrFilters : undefined);
  if (!database) {
    return [];
  }
  const filters =
    dbOrFilters && "prepare" in dbOrFilters ? maybeFilters : (dbOrFilters as MistakeEventFilters);

  let sql = "SELECT * FROM mistake_events WHERE 1=1";
  const params: unknown[] = [];

  if (filters?.resolved !== undefined) {
    sql += " AND resolved = ?";
    params.push(filters.resolved);
  }
  if (filters?.tool_name) {
    sql += " AND tool_name = ?";
    params.push(filters.tool_name);
  }
  if (filters?.category) {
    sql += " AND category = ?";
    params.push(filters.category);
  }
  if (filters?.severity) {
    sql += " AND severity = ?";
    params.push(filters.severity);
  }
  sql += " ORDER BY ts DESC";

  if (filters?.limit) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    ts: Number(row.ts),
    run_id: typeof row.run_id === "string" ? row.run_id : null,
    tool_name: typeof row.tool_name === "string" ? row.tool_name : null,
    category: row.category as MistakeCategory,
    summary: String(row.summary),
    expected: typeof row.expected === "string" ? row.expected : null,
    actual: typeof row.actual === "string" ? row.actual : null,
    severity: row.severity as MistakeSeverity,
    resolved: Number(row.resolved),
    notes: typeof row.notes === "string" ? row.notes : null,
  }));
}

export function resolveMistake(db: Database.Database, id: string, notes?: string): void;
export function resolveMistake(id: string, notes?: string): void;
export function resolveMistake(
  dbOrId: Database.Database | string,
  idOrNotes?: string,
  maybeNotes?: string,
): void {
  const database = resolveDb(typeof dbOrId === "string" ? undefined : dbOrId);
  if (!database) {
    return;
  }
  const id = typeof dbOrId === "string" ? dbOrId : String(idOrNotes ?? "");
  const notes = typeof dbOrId === "string" ? idOrNotes : maybeNotes;
  database
    .prepare("UPDATE mistake_events SET resolved = 1, notes = ? WHERE id = ?")
    .run(notes ?? null, id);
}
