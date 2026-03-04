/**
 * Memory / Mistake Ledger v1 — API
 * Provides methods to record events and query the ledger.
 */

import { createHash, randomUUID } from "node:crypto";
import { createSqliteBackend, type LedgerBackend } from "./db.js";
import { redact } from "./redact.js";
import type { LedgerEventInput, LedgerEventRow, LedgerQuery } from "./types.js";

const DEFAULT_LIMIT = 50;

export interface LedgerOptions {
  enabled?: boolean;
  path?: string;
  redact?: boolean;
}

export interface LedgerDeps {
  createBackend?: (options: LedgerOptions) => LedgerBackend;
}

export class Ledger {
  private readonly backend: LedgerBackend;
  private readonly isEnabled: boolean;
  private readonly shouldRedact: boolean;

  constructor(options: LedgerOptions = {}, deps: LedgerDeps = {}) {
    this.isEnabled = options.enabled !== false;
    this.shouldRedact = options.redact !== false;
    this.backend = (deps.createBackend ?? createSqliteBackend)(options);
  }

  enabled(): boolean {
    return this.isEnabled;
  }

  private normalizeDetail(detail: Record<string, unknown>): string {
    const sortedKeys = Object.keys(detail).toSorted();
    const normalized = sortedKeys.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = detail[key];
      return acc;
    }, {});
    return JSON.stringify(normalized);
  }

  record(input: LedgerEventInput): { id: string } | null {
    if (!this.isEnabled) {
      return null;
    }

    const hash = createHash("sha256").update(this.normalizeDetail(input.detail)).digest("hex");
    const event: LedgerEventRow = {
      id: randomUUID(),
      ts: Date.now(),
      kind: input.kind,
      run_id: input.runId ?? null,
      tool_name: input.toolName ?? null,
      agent_id: input.agentId ?? null,
      user_id: input.userId ?? null,
      session_id: input.sessionId ?? null,
      severity: input.severity ?? "info",
      title: input.title,
      detail_json: JSON.stringify(redact(input.detail, { enabled: this.shouldRedact })),
      tags_json: input.tags ? JSON.stringify(input.tags) : null,
      source: input.source ?? "agent",
      related_id: input.relatedId ?? null,
      hash,
    };

    this.backend.insert(event);
    return { id: event.id };
  }

  query(query: LedgerQuery = {}): LedgerEventRow[] {
    if (!this.isEnabled) {
      return [];
    }
    return this.backend.query({ ...query, limit: query.limit ?? DEFAULT_LIMIT });
  }

  health(): {
    enabled: boolean;
    path: string;
    version: number;
    ok: boolean;
    error?: string;
  } {
    return { enabled: this.isEnabled, ...this.backend.health() };
  }

  close(): void {
    this.backend.close();
  }
}

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
