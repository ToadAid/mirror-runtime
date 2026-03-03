/**
 * Memory / Mistake Ledger v1 — Public API
 */

export type {
  MemoryKind,
  MistakeCategory,
  MistakeSeverity,
  LedgerSource,
  MemoryEvent,
  MistakeEvent,
  AddMemoryEventResult,
  AddMistakeEventResult,
} from "./types.js";

export { initLedger, getLedgerDb, isLedgerEnabled, getLedgerPath, closeLedger, getLedgerStats } from "./db.js";
export { addMemoryEvent, listMemoryEvents, addMistakeEvent, listMistakeEvents, resolveMistake } from "./api.js";