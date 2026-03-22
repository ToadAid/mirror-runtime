import { describe, expect, it } from "vitest";
import { loadRuntimeSourceFilesForGuardrails } from "../test-utils/runtime-source-guardrail-scan.js";

const MIRROR_OWNED_PREFIXES = ["src/mirror/", "src/mirror-runtime/", "src/mirror-cli/"] as const;
const ALLOWED_PATHS: readonly string[] = new Set([]);
const OPENCLAW_IMPORT_PATTERNS = [
  /\bimport\s+type\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*openclaw[^"'`]*)["'`]/gu,
  /\bimport\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*openclaw[^"'`]*)["'`]/gu,
  /\bexport\s+[^;]*?\bfrom\s*["'`](?<specifier>[^"'`]*openclaw[^"'`]*)["'`]/gu,
  /\bimport\s*\(\s*["'`](?<specifier>[^"'`]*openclaw[^"'`]*)["'`]\s*\)/gu,
  /\brequire\s*\(\s*["'`](?<specifier>[^"'`]*openclaw[^"'`]*)["'`]\s*\)/gu,
] as const;

function stripCommentsForScan(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Mirror-owned OpenClaw import boundary", () => {
  it("rejects direct OpenClaw-specific import/package coupling in canonical Mirror-owned modules", async () => {
    const files = await loadRuntimeSourceFilesForGuardrails(process.cwd());
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = file.relativePath.replaceAll("\\", "/");
      if (!MIRROR_OWNED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
        continue;
      }
      if (ALLOWED_PATHS.has(relativePath)) {
        continue;
      }

      const scanSource = stripCommentsForScan(file.source);
      const matches = new Set<string>();
      for (const pattern of OPENCLAW_IMPORT_PATTERNS) {
        for (const match of scanSource.matchAll(pattern)) {
          const specifier = match.groups?.specifier?.trim();
          if (specifier) {
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
