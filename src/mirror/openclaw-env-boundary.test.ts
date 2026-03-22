import { describe, expect, it } from "vitest";
import { loadRuntimeSourceFilesForGuardrails } from "../test-utils/runtime-source-guardrail-scan.js";

const MIRROR_OWNED_PREFIXES = ["src/mirror/", "src/mirror-runtime/", "src/mirror-cli/"] as const;
<<<<<<< HEAD
const ALLOWED_PATHS: ReadonlySet<string> = new Set();
=======
const ALLOWED_PATHS: readonly string[] = new Set([]);
>>>>>>> 5221132c9 (test(ci): add boundary gate for OpenClaw-specific env/config coupling in Mirror-owned modules)
const OPENCLAW_ENV_PATTERN = /\bOPENCLAW_[A-Z0-9_]+\b/g;

describe("Mirror-owned OpenClaw env boundary", () => {
  it("rejects direct OPENCLAW_* env/config coupling in canonical Mirror-owned modules", async () => {
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

      const matches = file.source.match(OPENCLAW_ENV_PATTERN);
      if (!matches || matches.length === 0) {
        continue;
      }

      offenders.push(`${relativePath}: ${Array.from(new Set(matches)).join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });
});
