import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror packaging readme doc", () => {
  it("keeps the standalone packaging boundary documented", () => {
    const readme = fs.readFileSync(
      path.join(process.cwd(), "packaging/mirror-runtime/README.md"),
      "utf8",
    );

    expect(readme).toContain("/opt/mirror-runtime");

    expect(readme).toContain("- `bin/mirror`");
    expect(readme).toContain("- `mirror.mjs`");
    expect(readme).toContain("- `dist/mirror-entry.js`");
    expect(readme).toContain("- `dist/mirror-package.js`");

    expect(readme).toContain("dist/mirror-runtime-linux/");
    expect(readme).toContain("mirror-runtime-linux.tar.gz");

    expect(readme).toContain("pnpm package:mirror-runtime");
    expect(readme).toContain("pnpm verify:mirror-runtime-dist");
    expect(readme).toContain("pnpm verify:mirror-runtime-bootstrap");
  });
});
