import { describe, expect, it } from "vitest";
import { formatMirrorNudgeFooter } from "../nudge_surface.js";

describe("formatMirrorNudgeFooter", () => {
  it("returns empty string for no nudges", () => {
    expect(formatMirrorNudgeFooter([])).toBe("");
  });

  it("renders stable header and max 3 nudges", () => {
    const footer = formatMirrorNudgeFooter([
      "Adjust exec: repeated tool_error (8x).",
      "Adjust read: repeated tool_error (5x).",
      "Adjust write: repeated tool_error (4x).",
      "Adjust message: repeated tool_error (3x).",
    ]);

    expect(footer).toContain("🪞 Mirror Nudge:");
    expect(footer).toContain("- Adjust exec: repeated tool_error (8x).");
    expect(footer).toContain("- Adjust read: repeated tool_error (5x).");
    expect(footer).toContain("- Adjust write: repeated tool_error (4x).");
    expect(footer).not.toContain("Adjust message");
  });

  it("truncates very long nudge lines", () => {
    const footer = formatMirrorNudgeFooter(["x".repeat(400)]);
    const line = footer.split("\n")[1] ?? "";
    expect(line.length).toBeLessThanOrEqual(123);
    expect(line.endsWith("…")).toBe(true);
  });
});
