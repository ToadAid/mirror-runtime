import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror operator guide doc", () => {
  it("keeps the intended operator boundary documented", () => {
    const guide = fs.readFileSync(
      path.join(process.cwd(), "docs/mirror/MIRROR_OPERATOR_GUIDE.md"),
      "utf8",
    );

    expect(guide).toContain("`mirror ...` for the standalone Mirror CLI");
    expect(guide).toContain("`/mirror/*` for the standalone Mirror service routes");

    expect(guide).toContain("Compatibility-only path:");
    expect(guide).toContain("`openclaw mirror ...` for legacy diagnostics and telemetry workflows");

    expect(guide).toContain("Mirror provides operators with read-only inspection tools for:");
    expect(guide).toContain(
      "These tools are intended to inspect Mirror runtime behavior without modifying runtime state.",
    );

    expect(guide).toContain("```bash\nmirror status\n```");
    expect(guide).toContain("```bash\nmirror verify-lore\n```");

    expect(guide).toContain("```bash\nopenclaw mirror passport\n```");
    expect(guide).toContain("```bash\nopenclaw mirror telemetry tail\n```");
    expect(guide).toContain("```bash\nopenclaw mirror telemetry replay\n```");
    expect(guide).toContain("```bash\nopenclaw mirror telemetry index\n```");
    expect(guide).toContain("```bash\nopenclaw mirror telemetry query\n```");
    expect(guide).toContain("```bash\nopenclaw mirror telemetry reflect\n```");
  });
});
