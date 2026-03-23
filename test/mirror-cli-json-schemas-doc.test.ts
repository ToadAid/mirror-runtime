import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror cli json schemas doc", () => {
  it("keeps the canonical json automation boundary documented", () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), "docs/mirror/CLI_JSON_SCHEMAS.md"),
      "utf8",
    );

    expect(doc).toContain(
      "The canonical automation surface is `mirror ...`. `openclaw mirror ...` is compatibility-only.",
    );

    expect(doc).toContain("## `mirror status --json`");
    expect(doc).toContain("## `mirror serve --json`");
    expect(doc).toContain("## `mirror verify-lore --json`");

    expect(doc).toContain(
      "Compatibility-only admin paths such as `openclaw mirror doctor`, `passport`, and telemetry replay/index/query/reflect are not part of the canonical standalone Mirror JSON automation surface.",
    );
  });
});
