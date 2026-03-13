import { describe, expect, it } from "vitest";
import { forgeScroll } from "./forge_scroll.js";

describe("forgeScroll", () => {
  it("generates a schema-shaped scroll template", async () => {
    const result = await forgeScroll({
      title: "Renewal of the Quiet Pond",
      category: "L",
      narrative: "Renewal begins at sunrise and returns through stillness.",
    });

    expect(result.filename).toBe("TOBY_L0000_Renewal_of_the_Quiet_Pond.md");
    expect(result.frontmatter).toContain("title: Renewal of the Quiet Pond");
    expect(result.frontmatter).toContain("epoch: TBD");
    expect(result.frontmatter).toContain("sha256_seed: TBD");
    expect(result.scroll_template).toContain("# Renewal of the Quiet Pond");
    expect(result.validation.warningCount).toBe(0);
  });

  it("suggests symbols from the symbol registry", async () => {
    const result = await forgeScroll({
      title: "Renewal of the Quiet Pond",
      category: "C",
      narrative: "Renewal begins at sunrise beside the pond and returns to stillness.",
    });

    expect(result.suggested_symbols).toContain("🌅");
    expect(result.suggested_symbols).toContain("🌊");
  });

  it("returns validation diagnostics for generated anchors", async () => {
    const result = await forgeScroll({
      title: "Question of the Mirror",
      category: "QA",
      narrative: "The traveler asks what reflection means.",
      symbols: ["🪞"],
      anchors: {
        prev: "TOBY_L999_Missing.md",
      },
    });

    expect(result.validation.warningCount).toBeGreaterThan(0);
    expect(result.validation.warnings.some((warning) => warning.code === "anchor_missing")).toBe(
      true,
    );
  });
});
