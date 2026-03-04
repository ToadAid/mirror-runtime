/**
 * Memory / Mistake Ledger v1 — Redaction Utilities
 * Prevents secrets from leaking into the ledger database.
 */

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

const SENSITIVE_PATTERNS = [
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /password/i,
  /private/i,
  /mnemonic/i,
  /seed/i,
];

function redactRecursive(value: JsonLike): JsonLike {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactRecursive(entry));
  }

  const result: { [key: string]: JsonLike } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = redactRecursive(entry);
  }
  return result;
}

export function redact<T extends Record<string, unknown>>(
  obj: T,
  options: { enabled?: boolean } = {},
): T {
  const { enabled = true } = options;
  if (!enabled) {
    return obj;
  }
  return redactRecursive(obj as JsonLike) as T;
}
