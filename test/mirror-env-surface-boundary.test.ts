import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone env surface", () => {
  it("keeps the canonical env/help surface Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-entry.ts"), "utf8");

    expect(source).toContain("Environment:");
    expect(source).toContain("MIRROR_PROVIDER_URL");
    expect(source).toContain("MIRROR_PROVIDER_AUTH_TOKEN");
    expect(source).toContain("MIRROR_OPERATOR_TOKEN");
    expect(source).toContain("MIRROR_LORE_DIR");

    expect(source).not.toContain("OPENCLAW_PROVIDER_URL");
    expect(source).not.toContain("OPENCLAW_PROVIDER_AUTH_TOKEN");
    expect(source).not.toContain("OPENCLAW_OPERATOR_TOKEN");
    expect(source).not.toContain("OPENCLAW_LORE_DIR");

    expect(source).toContain("Compatibility:");
    expect(source).toContain(
      "\\`openclaw mirror ...\\` remains available for compatibility-only diagnostics flows.",
    );

    const environmentIndex = source.indexOf("Environment:");
    const compatibilityIndex = source.indexOf("Compatibility:");

    expect(environmentIndex).toBeGreaterThanOrEqual(0);
    expect(compatibilityIndex).toBeGreaterThan(environmentIndex);
  });
});
