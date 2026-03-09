import path from "node:path";
import { sha256File } from "./hash.js";
import type {
  MirrorLoreManifest,
  MirrorLoreManifestEntry,
  MirrorLoreManifestVerificationReport,
  VerifyLoreManifestOptions,
} from "./types.js";

function assertValidManifest(manifest: MirrorLoreManifest): void {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("verifyLoreManifest: manifest is required");
  }
  if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
    throw new TypeError("verifyLoreManifest: manifest.version must be a non-empty string");
  }
  if (typeof manifest.canonicalDir !== "string" || manifest.canonicalDir.trim().length === 0) {
    throw new TypeError("verifyLoreManifest: manifest.canonicalDir must be a non-empty string");
  }
  if (!Array.isArray(manifest.scrolls)) {
    throw new TypeError("verifyLoreManifest: manifest.scrolls must be an array");
  }

  for (const entry of manifest.scrolls) {
    assertValidManifestEntry(entry);
  }
}

function assertValidManifestEntry(entry: MirrorLoreManifestEntry): void {
  if (!entry || typeof entry !== "object") {
    throw new TypeError("verifyLoreManifest: each manifest entry must be an object");
  }
  if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
    throw new TypeError("verifyLoreManifest: each entry.path must be a non-empty string");
  }
  if (typeof entry.sha256 !== "string" || entry.sha256.trim().length === 0) {
    throw new TypeError("verifyLoreManifest: each entry.sha256 must be a non-empty string");
  }
}

export async function verifyLoreManifest(
  opts: VerifyLoreManifestOptions,
): Promise<MirrorLoreManifestVerificationReport> {
  if (!opts || typeof opts !== "object") {
    throw new TypeError("verifyLoreManifest: options are required");
  }
  if (typeof opts.baseDir !== "string" || opts.baseDir.trim().length === 0) {
    throw new TypeError("verifyLoreManifest: baseDir must be a non-empty string");
  }

  assertValidManifest(opts.manifest);

  const missing: string[] = [];
  const mismatched: MirrorLoreManifestVerificationReport["mismatched"] = [];

  for (const entry of opts.manifest.scrolls) {
    const filePath = path.resolve(opts.baseDir, entry.path);
    try {
      const actual = await sha256File(filePath);
      const expected = entry.sha256.toLowerCase();
      if (actual !== expected) {
        mismatched.push({
          path: entry.path,
          expected,
          actual,
        });
      }
    } catch (error) {
      const maybeErr = error as NodeJS.ErrnoException;
      if (maybeErr?.code === "ENOENT") {
        missing.push(entry.path);
        continue;
      }
      throw error;
    }
  }

  const checked = opts.manifest.scrolls.length;
  const matched = checked - missing.length - mismatched.length;

  return {
    ok: missing.length === 0 && mismatched.length === 0,
    checked,
    matched,
    missing,
    mismatched,
  };
}
