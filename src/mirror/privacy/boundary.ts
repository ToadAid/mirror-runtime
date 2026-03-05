const BLOCKED_KEYS = new Set([
  "name",
  "humanname",
  "realname",
  "travelername",
  "username",
  "email",
  "phone",
  "telegram",
  "discord",
  "twitter",
  "address",
  "city",
  "zip",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key.toLowerCase())) {
      continue;
    }
    sanitized[key] = sanitizeValue(entry);
  }
  return sanitized;
}

export function isMirrorPrivacyBoundaryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_PRIVACY_BOUNDARY_ENABLED === "1";
}

export function sanitizeTelemetryEvent<T>(event: T): T {
  return sanitizeValue(event) as T;
}
