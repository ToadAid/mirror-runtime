import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

export type MirrorJournalEventType =
  | "policy.decision"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "approval.token.accepted"
  | "approval.token.rejected"
  | "tool.executed"
  | "tool.failed";

export type MirrorJournalEntry = {
  ts: string;
  event_type: MirrorJournalEventType;
  trace_id: string;
  caller_agent?: string;
  tool_name?: string;
  decision?: string;
  risk_tier?: string;
  reason?: string;
  args_hash?: string;
  approval_id?: string;
  ok?: boolean;
  error?: string;
};

export type AppendMirrorJournalInput = Omit<MirrorJournalEntry, "ts"> & {
  ts?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }
  if (isRecord(value)) {
    const sorted: JsonRecord = {};
    for (const key of Object.keys(value).toSorted()) {
      sorted[key] = sortJson(value[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function hashJournalArgs(args: unknown): string {
  return createHash("sha256").update(canonicalJson(args)).digest("hex");
}

export function resolveMirrorJournalPath(explicitPath?: string): string {
  if (explicitPath && explicitPath.trim()) {
    return path.resolve(explicitPath);
  }
  if (process.env.MIRROR_RUN_JOURNAL_PATH?.trim()) {
    return path.resolve(process.env.MIRROR_RUN_JOURNAL_PATH.trim());
  }
  return path.resolve(process.cwd(), ".mirror", "run_journal.jsonl");
}

export async function appendMirrorJournalEntry(
  entry: AppendMirrorJournalInput,
  explicitPath?: string,
): Promise<void> {
  const filePath = resolveMirrorJournalPath(explicitPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: MirrorJournalEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    event_type: entry.event_type,
    trace_id: entry.trace_id,
    caller_agent: entry.caller_agent,
    tool_name: entry.tool_name,
    decision: entry.decision,
    risk_tier: entry.risk_tier,
    reason: entry.reason,
    args_hash: entry.args_hash,
    approval_id: entry.approval_id,
    ok: entry.ok,
    error: entry.error,
  };
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

export async function readMirrorJournal(params?: {
  limit?: number;
  path?: string;
}): Promise<MirrorJournalEntry[]> {
  const filePath = resolveMirrorJournalPath(params?.path);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const parsed: MirrorJournalEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const value = JSON.parse(line) as unknown;
      if (
        isRecord(value) &&
        typeof value.event_type === "string" &&
        typeof value.trace_id === "string" &&
        typeof value.ts === "string"
      ) {
        parsed.push(value as MirrorJournalEntry);
      }
    } catch {
      // Keep reader resilient to partial/corrupt lines.
    }
  }

  const limit = params?.limit;
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    if (limit === 0) {
      return [];
    }
    return parsed.slice(Math.max(0, parsed.length - Math.floor(limit)));
  }
  return parsed;
}
