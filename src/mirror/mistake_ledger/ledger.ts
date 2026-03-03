/**
 * Memory / Mistake Ledger v1 — API
 * Provides methods to record events and query the ledger.
 */

import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import {
  LedgerEventInput,
  LedgerEventRow,
  LedgerQuery,
  LedgerKind,
  LedgerSeverity,
  LedgerSource,
} from "./types.js";
import { openLedgerDb, withTx, healthCheck } from "./db.js";
import { redact } from "./redact.js";

const DEFAULT_LIMIT = 50;

export interface LedgerOptions {
  enabled?: boolean;
  path?: string;
  redact?: boolean;
}

export class Ledger {
  private db: Database.Database;
  private enabled: boolean;
  private redact: boolean;

  constructor(options: LedgerOptions = {}) {
    this.enabled = options.enabled !== false; // default true
    this.redact = options.redact !== false; // default true
    this.db = openLedgerDb(options);
  }

  enabled(): boolean {
    return this.enabled;
  }

  /**
   * Normalize and hash the detail object for deduplication
   */
  private normalizeDetail(detail: Record<string, unknown>): string {
    // Stable JSON stringification (sorted keys)
    const sortedKeys = Object.keys(detail).sort();
    const normalized = sortedKeys.reduce((acc, key) => {
      acc[key] = detail[key];
      return acc;
    }, {} as Record<string, unknown>);
    return JSON.stringify(normalized);
  }

  /**
   * Record an event in the ledger
   */
  record(input: LedgerEventInput): { id: string } | null {
    if (!this.enabled) {
      return null;
    }

    const normalizedDetail = this.normalizeDetail(input.detail);
    const hash = createHash("sha256").update(normalizedDetail).digest("hex");

    const event = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      kind: input.kind,
      run_id: input.runId ?? null,
      tool_name: input.toolName ?? null,
      agent_id: input.agentId ?? null,
      user_id: input.userId ?? null,
      session_id: input.sessionId ?? null,
      severity: input.severity ?? "info",
      title: input.title,
      detail_json: JSON.stringify(redact(input.detail, { enabled: this.redact })),
      tags_json: input.tags ? JSON.stringify(input.tags) : null,
      source: input.source ?? "agent",
      related_id: input.relatedId ?? null,
      hash,
    };

    const stmt = this.db.prepare(
      `INSERT INTO ledger_events (
        id, ts, kind, run_id, tool_name, agent_id, user_id, session_id,
        severity, title, detail_json, tags_json, source, related_id, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    stmt.run(
      event.id,
      event.ts,
      event.kind,
      event.run_id,
      event.tool_name,
      event.agent_id,
      event.user_id,
      event.session_id,
      event.severity,
      event.title,
      event.detail_json,
      event.tags_json,
      event.source,
      event.related_id,
      event.hash,
    );

    return { id: event.id };
  }

  /**
   * Query events from the ledger
   */
  query(query: LedgerQuery): LedgerEventRow[] {
    if (!this.enabled) {
      return [];
    }

    const q = query.limit ?? DEFAULT_LIMIT;
    const sql = `
      SELECT * FROM ledger_events
      WHERE 1=1
      ${query.kind ? "AND kind = ?" : ""}
      ${query.runId ? "AND run_id = ?" : ""}
      ${query.toolName ? "AND tool_name = ?" : ""}
      ${query.sinceTs ? "AND ts >= ?" : ""}
      ${query.untilTs ? "AND ts <= ?" : ""}
      ORDER BY ts DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const params = [
      query.kind,
      query.runId,
      query.toolName,
      query.sinceTs,
      query.untilTs,
      q,
    ].filter(Boolean);

    return stmt.all(...params) as LedgerEventRow[];
  }

  /**
   * Get ledger health status
   */
  health(): {
    enabled: boolean;
    path: string;
    version: number;
    ok: boolean;
    error?: string;
  } {
    return healthCheck(this.db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let ledgerInstance: Ledger | null = null;

export function getLedger(options?: LedgerOptions): Ledger {
  if (!ledgerInstance) {
    ledgerInstance = new Ledger(options);
  }
  return ledgerInstance;
}

export function resetLedger(): void {
  if (ledgerInstance) {
    ledgerInstance.close();
    ledgerInstance = null;
  }
}