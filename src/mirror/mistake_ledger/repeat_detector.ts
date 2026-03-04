import type { LedgerEventRow } from "./types.js";

const MAX_ERROR_SUMMARY_LEN = 160;

type SignatureInput = {
  toolName?: string | null;
  error?: unknown;
};

function normalizeToolName(toolName?: string | null): string {
  const normalized = (toolName ?? "").trim().toLowerCase();
  return normalized || "unknown";
}

function normalizeErrorSummary(error: unknown): string {
  let errorText = "";
  if (typeof error === "string") {
    errorText = error;
  } else if (error instanceof Error) {
    errorText = error.message;
  } else if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    errorText = String(error);
  } else if (error !== null && error !== undefined) {
    try {
      errorText = JSON.stringify(error);
    } catch {
      errorText = "";
    }
  }

  const firstLine = errorText.split("\n")[0]?.trim();
  if (!firstLine) {
    return "unknown";
  }

  return firstLine
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "0x*")
    .replace(/\b\d{3,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_SUMMARY_LEN);
}

export function makeErrorSignature(input: SignatureInput): string {
  const tool = normalizeToolName(input.toolName);
  const err = normalizeErrorSummary(input.error);
  return `tool:${tool}|err:${err}`;
}

function extractSignatureFromDetailJson(row: LedgerEventRow): string | null {
  try {
    const parsed = JSON.parse(row.detail_json) as {
      signature?: unknown;
      meta?: { signature?: unknown };
    };
    if (typeof parsed.signature === "string" && parsed.signature.trim()) {
      return parsed.signature.trim();
    }
    if (typeof parsed.meta?.signature === "string" && parsed.meta.signature.trim()) {
      return parsed.meta.signature.trim();
    }
  } catch {
    // Ignore malformed detail_json rows.
  }
  return null;
}

export function countSignatureMatches(rows: LedgerEventRow[], signature: string): number {
  let matches = 0;
  for (const row of rows) {
    const rowSignature = extractSignatureFromDetailJson(row);
    if (!rowSignature) {
      continue;
    }
    if (rowSignature === signature) {
      matches += 1;
    }
  }
  return matches;
}
