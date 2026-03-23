import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone reflection entry surface", () => {
  it("keeps the canonical reflection-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-reflection/index.ts"),
      "utf8",
    );

    expect(source).toContain("buildReflectionPrompt");
    expect(source).toContain("reflectOnCanonContext");
    expect(source).toContain("reviewCanonDraft");
    expect(source).toContain('} from "./reflection_engine.js";');
    expect(source).toContain('export { analyzeCanonContext } from "./canon_analysis.js";');
    expect(source).toContain('export { analyzeSymbolResonance } from "./symbol_analysis.js";');
    expect(source).toContain('export { reviewDraftAgainstCanon } from "./draft_review.js";');
    expect(source).toContain("MirrorCanonReflection");
    expect(source).toContain("MirrorDraftReview");
    expect(source).toContain("MirrorSymbolResonance");
    expect(source).toContain("ReflectCanonInput");
    expect(source).toContain("ReviewDraftInput");
    expect(source).toContain('} from "./reflection_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
