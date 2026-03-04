/**
 * Memory / Mistake Ledger v1 — Types
 * Lightweight SQLite ledger for recording memory events and mistakes.
 */

export type LedgerKind = "memory" | "mistake" | "decision";
export type LedgerSeverity = "info" | "warn" | "error";
export type LedgerSource = "user" | "agent" | "system";

export interface LedgerEventInput {
  kind: LedgerKind;
  title: string;
  severity?: LedgerSeverity;
  source?: LedgerSource;
  runId?: string;
  toolName?: string;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  relatedId?: string;
  detail: Record<string, unknown>;
}

export interface LedgerEventRow {
  id: string;
  ts: number;
  kind: LedgerKind;
  run_id: string | null;
  tool_name: string | null;
  agent_id: string | null;
  user_id: string | null;
  session_id: string | null;
  severity: LedgerSeverity;
  title: string;
  detail_json: string;
  tags_json: string | null;
  source: LedgerSource;
  related_id: string | null;
  hash: string;
}

export interface LedgerQuery {
  kind?: LedgerKind;
  runId?: string;
  toolName?: string;
  source?: LedgerSource;
  sinceTs?: number;
  untilTs?: number;
  limit?: number;
}
