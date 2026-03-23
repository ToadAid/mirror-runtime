import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror method doc", () => {
  it("keeps the standalone mirror identity boundary documented", () => {
    const doc = fs.readFileSync(path.join(process.cwd(), "docs/mirror/MIRROR_METHOD.md"), "utf8");

    expect(doc).toContain(
      "Mirror is the canonical identity for the standalone runtime, CLI, service, and console surfaces.",
    );
    expect(doc).toContain(
      "`openclaw mirror ...` exists only as a compatibility wrapper for legacy operational flows.",
    );

    expect(doc).toContain(
      "Canonical standalone operator commands include `mirror status`, `mirror verify-lore`, and `mirror sync ...`.",
    );
    expect(doc).toContain(
      "Compatibility-only admin flows remain under `openclaw mirror doctor|passport|telemetry ...`.",
    );
  });
});
