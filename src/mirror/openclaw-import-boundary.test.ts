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
const MIRROR_OWNED_FILES = ["src/mirror-entry.ts", "src/mirror-package.ts"] as const;
const ALLOWED_PATHS: ReadonlySet<string> = new Set<string>([]);
const MODULE_SPECIFIER_PATTERNS = [
  /\bimport\s+type\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*)["'`]/gu,
  /\bimport\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*)["'`]/gu,
  /\bexport\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*)["'`]/gu,
  /\bimport\s*\(\s*["'`](?<specifier>[^"'`]*)["'`]\s*\)/gu,
  /\brequire\s*\(\s*["'`](?<specifier>[^"'`]*)["'`]\s*\)/gu,
] as const;

function isCanonicalMirrorOwnedFile(relativePath: string): boolean {
  if (!relativePath.endsWith(".ts") && !relativePath.endsWith(".tsx")) {
    return false;
  }
  if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
    return false;
  }
  return (
    MIRROR_OWNED_PREFIXES.some((prefix) => relativePath.startsWith(prefix)) ||
    MIRROR_OWNED_FILES.includes(relativePath)
  );
}

function stripCommentsForScan(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isOpenClawCompatSpecifier(specifier: string): boolean {
  const normalized = specifier.replaceAll("\\", "/");
  return (
    normalized === "openclaw" ||
    normalized.startsWith("openclaw/") ||
    normalized.includes("/compat/openclaw/") ||
    normalized.endsWith("/compat/openclaw")
  );
}

describe("Mirror-owned OpenClaw import boundary", () => {
  it("rejects direct OpenClaw/compat import coupling in canonical Mirror-owned modules", async () => {
    const files = await loadRuntimeSourceFilesForGuardrails(process.cwd());
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = file.relativePath.replaceAll("\\", "/");
      if (!isCanonicalMirrorOwnedFile(relativePath) || ALLOWED_PATHS.has(relativePath)) {
        continue;
      }

      const scanSource = stripCommentsForScan(file.source);
      const matches = new Set<string>();
      for (const pattern of MODULE_SPECIFIER_PATTERNS) {
        for (const match of scanSource.matchAll(pattern)) {
          const specifier = match.groups?.specifier?.trim();
          if (specifier && isOpenClawCompatSpecifier(specifier)) {
            matches.add(specifier);
          }
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
