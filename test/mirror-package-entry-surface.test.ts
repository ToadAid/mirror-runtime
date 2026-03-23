import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone package entry surface", () => {
  it("keeps the canonical package-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-package.ts"), "utf8");

    expect(source).toContain('export * from "./mirrordaemon/index.js";');
    expect(source).toContain('export * from "./mirror-service/index.js";');
    expect(source).toContain('export * from "./mirror-runtime/index.js";');
    expect(source).toContain('export * from "./mirror-provider/index.js";');
    expect(source).toContain('export * from "./mirror-gateway/index.js";');
    expect(source).toContain('export * from "./mirror-cli/index.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain('export * from "./compat/');
    expect(source).not.toContain('export * from "./openclaw');
  });
});
