/**
 * Memory / Mistake Ledger v1 — API
 */

import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getLedgerDb, isLedgerEnabled } from "./db.js";

type LedgerDb = Database.Database;

type MemoryEventInput = {
  kind: "memory" | "forget";
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
  kind?: "memory" | "forget";
  key?: string;
  limit?: number;
  since_ts?: number;
};

type MistakeEventInput = {
  category: string;
  summary: string;
  expected?: string;
  actual?: string;
  tool_name?: string;
  run_id?: string;
  severity: string;
  notes?: string;
};

type MistakeEventFilters = {
  resolved?: number;
  tool_name?: string;
  category?: string;
  severity?: string;
  limit?: number;
};

function resolveLedgerDb(database?: LedgerDb): LedgerDb {
  return database ?? getLedgerDb();
}

export function addMemoryEvent(database: LedgerDb, event: MemoryEventInput) {
  if (!isLedgerEnabled()) {
    return { event_id: "", is_duplicate: false };
  }

  const ledger = resolveLedgerDb(database);
  const id = crypto.randomUUID();
  const ts = Date.now();

  ledger
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

export function listMemoryEvents(database: LedgerDb, filters?: MemoryEventFilters) {
  if (!isLedgerEnabled()) {
    return [];
  }

  const ledger = resolveLedgerDb(database);
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

  const rows = ledger.prepare(sql).all(...params) as Array<{
    id: string;
    ts: number;
    user_id: string | null;
    session_id: string | null;
    kind: string;
    key: string;
    value_json: string;
    source: string | null;
    confidence: number | null;
    tags_json: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    user_id: row.user_id,
    session_id: row.session_id,
    kind: row.kind,
    key: row.key,
    value_json: JSON.parse(row.value_json) as Record<string, unknown>,
    source: row.source,
    confidence: row.confidence,
    tags_json: row.tags_json,
  }));
}

export function addMistakeEvent(database: LedgerDb, event: MistakeEventInput) {
  if (!isLedgerEnabled()) {
    return { event_id: "", is_duplicate: false };
  }

  const ledger = resolveLedgerDb(database);
  const id = crypto.randomUUID();
  const ts = Date.now();

  ledger
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

export function listMistakeEvents(database: LedgerDb, filters?: MistakeEventFilters) {
  if (!isLedgerEnabled()) {
    return [];
  }

  const ledger = resolveLedgerDb(database);
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

  const rows = ledger.prepare(sql).all(...params) as Array<{
    id: string;
    ts: number;
    run_id: string | null;
    tool_name: string | null;
    category: string;
    summary: string;
    expected: string | null;
    actual: string | null;
    severity: string;
    resolved: number;
    notes: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    run_id: row.run_id,
    tool_name: row.tool_name,
    category: row.category,
    summary: row.summary,
    expected: row.expected,
    actual: row.actual,
    severity: row.severity,
    resolved: row.resolved,
    notes: row.notes,
  }));
}

export function resolveMistake(database: LedgerDb, id: string, notes?: string) {
  if (!isLedgerEnabled()) {
    return;
  }

  const ledger = resolveLedgerDb(database);
  ledger
    .prepare("UPDATE mistake_events SET resolved = 1, notes = ? WHERE id = ?")
    .run(notes ?? null, id);
}
