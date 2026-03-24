import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone help surface", () => {
  it("keeps the canonical help surface Mirror-native", () => {
    const entrySource = fs.readFileSync(path.join(process.cwd(), "src/mirror-entry.ts"), "utf8");
    const schemaSource = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-cli/schemas.ts"),
      "utf8",
    );

    expect(entrySource).toContain("Usage:");
    expect(entrySource).toContain("mirror help [command]");
    expect(entrySource).toContain("mirror <command> [options]");

    expect(entrySource).toContain("Commands:");
    expect(entrySource).toContain("Compatibility:");
    expect(entrySource).toContain(
      "\\`openclaw mirror ...\\` remains available for compatibility-only diagnostics flows.",
    );

    const compatibilityIndex = entrySource.indexOf("Compatibility:");
    const mirrorHelpIndex = entrySource.indexOf("mirror help [command]");
    const mirrorCommandIndex = entrySource.indexOf("mirror <command> [options]");

    expect(mirrorHelpIndex).toBeGreaterThanOrEqual(0);
    expect(mirrorCommandIndex).toBeGreaterThanOrEqual(0);
    expect(compatibilityIndex).toBeGreaterThan(mirrorHelpIndex);
    expect(compatibilityIndex).toBeGreaterThan(mirrorCommandIndex);

    expect(schemaSource).toContain('command: "status"');
    expect(schemaSource).toContain('command: "verify-lore"');
    expect(schemaSource).toContain('command: "sync"');
    expect(schemaSource).toContain(
      "--manifest <path>: lore manifest path (default: <resolved lore dir>/manifest.json)",
    );
  });
});
