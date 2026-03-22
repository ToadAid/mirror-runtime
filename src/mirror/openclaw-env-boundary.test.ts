import { describe, expect, it } from "vitest";
import { loadRuntimeSourceFilesForGuardrails } from "../test-utils/runtime-source-guardrail-scan.js";

const MIRROR_OWNED_PREFIXES = [
  "src/mirror/",
  "src/mirror-cli/",
  "src/mirror-service/",
  "src/mirror-runtime/",
  "src/mirror-provider/",
  "src/mirror-gateway/",
  "src/mirrordaemon/",
] as const;
const MIRROR_OWNED_FILES: ReadonlySet<string> = new Set([
  "src/mirror-entry.ts",
  "src/mirror-package.ts",
]);
const ALLOWED_PATHS: ReadonlySet<string> = new Set<string>([]);
const OPENCLAW_ENV_PATTERNS = [/\bOPENCLAW_[A-Z0-9_]+\b/g, /\bCLAWDBOT_[A-Z0-9_]+\b/g] as const;

function isCanonicalMirrorOwnedFile(relativePath: string): boolean {
  if (!relativePath.endsWith(".ts") && !relativePath.endsWith(".tsx")) {
    return false;
  }
  if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
    return false;
  }
  return (
    MIRROR_OWNED_PREFIXES.some((prefix) => relativePath.startsWith(prefix)) ||
    MIRROR_OWNED_FILES.has(relativePath)
  );
}

function stripCommentsForScan(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Mirror-owned OpenClaw env boundary", () => {
  it("rejects direct OpenClaw-specific env/config coupling in canonical Mirror-owned modules", async () => {
    const files = await loadRuntimeSourceFilesForGuardrails(process.cwd());
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = file.relativePath.replaceAll("\\", "/");
      if (!isCanonicalMirrorOwnedFile(relativePath) || ALLOWED_PATHS.has(relativePath)) {
        continue;
      }

      const scanSource = stripCommentsForScan(file.source);
      const matches = new Set<string>();
      for (const pattern of OPENCLAW_ENV_PATTERNS) {
        for (const match of scanSource.matchAll(pattern)) {
          matches.add(match[0]);
        }
      }

      if (matches.size === 0) {
        continue;
      }

      offenders.push(`${relativePath}: ${Array.from(matches).toSorted().join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });
});
