/**
 * Memory / Mistake Ledger v1 — Types
 */

export type MemoryKind = "memory" | "forget";
export type MistakeCategory =
  | "tool_error"
  | "logic_error"
  | "context_mismatch"
  | "data_quality"
  | "config_error"
  | "unexpected_behavior";

export type MistakeSeverity = "low" | "medium" | "high" | "critical";

export type LedgerSource = "agent0" | "runtime" | "user" | "tool";

export interface MemoryEvent {
  id: string;
  ts: number;
  user_id: string | null;
  session_id: string | null;
  kind: MemoryKind;
  key: string;
  value_json: Record<string, unknown>;
  source: string | null;
  confidence: number | null;
  tags_json: string;
}

export interface MistakeEvent {
  id: string;
  ts: number;
  run_id: string | null;
  tool_name: string | null;
  category: MistakeCategory;
  summary: string;
  expected: string | null;
  actual: string | null;
  severity: MistakeSeverity;
  resolved: number;
  notes: string | null;
}

export interface AddMemoryEventResult {
  event_id: string;
  is_duplicate: boolean;
}

export interface AddMistakeEventResult {
  event_id: string;
  is_duplicate: boolean;
}