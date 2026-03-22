import { describe, expect, it } from "vitest";
import { loadRuntimeSourceFilesForGuardrails } from "../test-utils/runtime-source-guardrail-scan.js";

const MIRROR_OWNED_PREFIXES = ["src/mirror/", "src/mirror-runtime/", "src/mirror-cli/"] as const;
const ALLOWED_PATHS = [] as const;
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
      if (ALLOWED_PATHS.includes(relativePath)) {
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
