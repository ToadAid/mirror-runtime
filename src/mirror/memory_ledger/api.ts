/**
 * Memory / Mistake Ledger v1 — API
 */

import Database from "better-sqlite3";
import { isLedgerEnabled } from "./db.js";

if (!isLedgerEnabled()) {
  // Export no-op stubs when disabled
  export function addMemoryEvent() {
    return { event_id: "", is_duplicate: false };
  }
  export function listMemoryEvents() {
    return [];
  }
  export function addMistakeEvent() {
    return { event_id: "", is_duplicate: false };
  }
  export function listMistakeEvents() {
    return [];
  }
  export function resolveMistake() {}
} else {
  // Actual implementation when enabled
  const db = null; // will be initialized on first call

  function getDb(): Database {
    if (db) {return db;}
    const { initLedger } = require("./db.js");
    return initLedger();
  }

  export function addMemoryEvent(event: {
    kind: "memory" | "forget";
    key: string;
    value_json: Record<string, unknown>;
    user_id?: string;
    session_id?: string;
    source?: string;
    confidence?: number;
    tags_json?: string;
  }) {
    const database = getDb();
    const id = crypto.randomUUID();
    const ts = Date.now();

    database
      .prepare(
        "INSERT INTO memory_events (id, ts, user_id, session_id, kind, key, value_json, source, confidence, tags_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        ts,
        event.user_id,
        event.session_id,
        event.kind,
        event.key,
        JSON.stringify(event.value_json),
        event.source ?? null,
        event.confidence ?? null,
        event.tags_json ?? null
      );

    return { event_id: id, is_duplicate: false };
  }

  export function listMemoryEvents(filters?: {
    user_id?: string;
    session_id?: string;
    kind?: "memory" | "forget";
    key?: string;
    limit?: number;
    since_ts?: number;
  }) {
    const database = getDb();

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

    const stmt = database.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(
      (row: unknown) =>
        ({
          id: (row as { id: string }).id,
          ts: (row as { ts: number }).ts,
          user_id: (row as { user_id: string | null }).user_id,
          session_id: (row as { session_id: string | null }).session_id,
          kind: (row as { kind: string }).kind,
          key: (row as { key: string }).key,
          value_json: JSON.parse((row as { value_json: string }).value_json),
          source: (row as { source: string | null }).source,
          confidence: (row as { confidence: number | null }).confidence,
          tags_json: JSON.parse((row as { tags_json: string }).tags_json),
        } as {
          id: string;
          ts: number;
          user_id: string | null;
          session_id: string | null;
          kind: string;
          key: string;
          value_json: Record<string, unknown>;
          source: string | null;
          confidence: number | null;
          tags_json: string;
        })
    );
  }

  export function addMistakeEvent(event: {
    category: string;
    summary: string;
    expected?: string;
    actual?: string;
    tool_name?: string;
    run_id?: string;
    severity: string;
    notes?: string;
  }) {
    const database = getDb();
    const id = crypto.randomUUID();
    const ts = Date.now();

    database
      .prepare(
        "INSERT INTO mistake_events (id, ts, run_id, tool_name, category, summary, expected, actual, severity, resolved, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        ts,
        event.run_id,
        event.tool_name,
        event.category,
        event.summary,
        event.expected,
        event.actual,
        event.severity,
        0,
        event.notes
      );

    return { event_id: id, is_duplicate: false };
  }

  export function listMistakeEvents(filters?: {
    resolved?: number;
    tool_name?: string;
    category?: string;
    limit?: number;
  }) {
    const database = getDb();

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
    sql += " ORDER BY ts DESC";

    if (filters?.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const stmt = database.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(
      (row: unknown) =>
        ({
          id: (row as { id: string }).id,
          ts: (row as { ts: number }).ts,
          run_id: (row as { run_id: string | null }).run_id,
          tool_name: (row as { tool_name: string | null }).tool_name,
          category: (row as { category: string }).category,
          summary: (row as { summary: string }).summary,
          expected: (row as { expected: string | null }).expected,
          actual: (row as { actual: string | null }).actual,
          severity: (row as { severity: string }).severity,
          resolved: (row as { resolved: number }).resolved,
          notes: (row as { notes: string | null }).notes,
        } as {
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
        })
    );
  }

  export function resolveMistake(id: string, notes?: string) {
    const database = getDb();
    database.prepare("UPDATE mistake_events SET resolved = 1, notes = ? WHERE id = ?").run(notes ?? null, id);
  }
}