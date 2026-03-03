/**
 * Memory / Mistake Ledger v1 — Redaction Utilities
 * Prevents secrets from leaking into the ledger database.
 */

export function redact(obj: any, options: { enabled?: boolean } = {}): any {
  const { enabled = true } = options;

  if (!enabled) {
    return obj;
  }

  // Redact keys matching sensitive patterns
  const sensitivePatterns = [
    /secret/i,
    /token/i,
    /apikey/i,
    /api_key/i,
    /password/i,
    /private/i,
    /mnemonic/i,
    /seed/i,
  ];

  function redactRecursive(val: any): any {
    if (val === null || typeof val !== "object") {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map(redactRecursive);
    }

    const result: any = {};
    for (const key of Object.keys(val)) {
      const shouldRedact = sensitivePatterns.some((pattern) => pattern.test(key));

      if (shouldRedact) {
        result[key] = "[REDACTED]";
      } else if (typeof val[key] === "object") {
        result[key] = redactRecursive(val[key]);
      } else {
        result[key] = val[key];
      }
    }

    return result;
  }

  return redactRecursive(obj);
}