import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone launcher surface", () => {
  it("keeps the shipped launcher Mirror-native and wired to the standalone entrypoint", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "mirror.mjs"), "utf8");

    expect(source).toContain('tryImport("./dist/mirror-entry.js")');
    expect(source).toContain('tryImport("./dist/mirror-entry.mjs")');

    expect(source).toContain('typeof mod.runMirrorEntry !== "function"');
    expect(source).toContain("mod.runMirrorEntry(process.argv)");

    expect(source).toContain("mirror: missing dist/mirror-entry.(m)js (build output).");
    expect(source).toContain("mirror: dist/mirror-entry does not export runMirrorEntry().");

    expect(source).not.toContain("openclaw:");
    expect(source).not.toContain("OPENCLAW");
  });
});
