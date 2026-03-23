import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror split-readiness checklist doc", () => {
  it("keeps the settled split-readiness guardrails reflected in the checklist", () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), "docs/architecture/mirror-runtime-split-readiness-checklist.md"),
      "utf8",
    );

    expect(doc).toContain("### 6. Compatibility quarantine");
    expect(doc).toContain(
      "- [x] Canonical operator docs and entrypoints point to Mirror-native paths first.",
    );
    expect(doc).toContain(
      "Canonical entrypoint, operator, and JSON automation docs now point to Mirror-native paths first and describe `openclaw mirror ...` as compatibility-only.",
    );

    expect(doc).toContain("### 7. Packaging and build boundary");
    expect(doc).toContain("Current score: `yellow`");
    expect(doc).toContain(
      "Mirror now has an explicit package boundary, standalone Linux runtime artifact, extracted-artifact smoke, dist verification, and bootstrap verification.",
    );

    expect(doc).toContain("### 8. CI gates before split");
    expect(doc).toContain(
      "- [x] Boundary gates prevent new OpenClaw-specific env/config and import/package coupling inside Mirror-owned runtime modules.",
    );
    expect(doc).toContain(
      "- [x] Mirror-specific checks are isolated enough to serve as a true split gate rather than an early smoke lane.",
    );
    expect(doc).toContain(
      "Dedicated split-readiness gates now include first-class boundary enforcement for new OpenClaw-specific env/config and import/package coupling inside Mirror-owned modules.",
    );

    expect(doc).toContain("## Current known gaps");
    expect(doc).toContain("1. Move observability ownership under daemon/runtime control.");
    expect(doc).toContain(
      "2. Make any remaining console execution seams explicitly daemon-backed where they are still partial.",
    );
    expect(doc).toContain(
      "4. Keep parity coverage growing only where a canonical operator/runtime seam is still weak.",
    );
  });
});
