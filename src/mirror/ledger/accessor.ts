import fs from "node:fs";
import path from "node:path";
import { getLedger, type Ledger } from "../mistake_ledger/ledger.js";

const ENABLED_ENV = "MIRROR_LEDGER_ENABLED";
const PATH_ENV = "MIRROR_LEDGER_DB_PATH";
const DEFAULT_DB_PATH = path.resolve(process.cwd(), "db", "mirror-ledger.sqlite");

let initialized = false;
let ledgerInstance: Ledger | null = null;

function resolveDbPath(): string {
  const raw = process.env[PATH_ENV]?.trim();
  return raw && raw.length > 0 ? path.resolve(raw) : DEFAULT_DB_PATH;
}

export function initLedgerOnce(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  if (process.env[ENABLED_ENV] !== "1") {
    return;
  }

  try {
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    ledgerInstance = getLedger({ enabled: true, path: dbPath });
  } catch {
    // Never break runtime behavior if ledger init fails.
    ledgerInstance = null;
  }
}

type RecordMistakeParams = {
  kind: "tool_error" | "agent_error";
  message: string;
  runId?: string;
  agentId?: string;
  toolName?: string;
  meta?: Record<string, unknown>;
};

export function recordMistake(params: RecordMistakeParams): void {
  if (process.env[ENABLED_ENV] !== "1") {
    return;
  }
  if (!ledgerInstance) {
    return;
  }

  try {
    ledgerInstance.record({
      kind: "mistake",
      title: params.kind,
      runId: params.runId,
      agentId: params.agentId,
      toolName: params.toolName,
      severity: "warn",
      source: "system",
      detail: {
        message: params.message,
        ...(params.meta ? { meta: params.meta } : {}),
      },
    });
  } catch {
    // Never break runtime behavior if write fails.
  }
}
