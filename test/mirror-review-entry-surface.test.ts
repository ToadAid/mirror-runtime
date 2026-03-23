import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone review entry surface", () => {
  it("keeps the canonical review-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-review/index.ts"), "utf8");

    expect(source).toContain('export { reviewDraftForCanon } from "./review_engine.js";');
    expect(source).toContain('export { MIRROR_REVIEW_RULES } from "./review_rules.js";');
    expect(source).toContain('export { detectCanonConflicts } from "./canon_conflict.js";');
    expect(source).toContain(
      'export { detectNarrativeSimilarity } from "./narrative_similarity.js";',
    );
    expect(source).toContain('export { validateDraftSymbols } from "./symbol_validation.js";');
    expect(source).toContain("MirrorCanonConflict");
    expect(source).toContain("MirrorCanonReviewResult");
    expect(source).toContain("MirrorNarrativeSimilarity");
    expect(source).toContain("MirrorReviewStatus");
    expect(source).toContain("MirrorSymbolValidation");
    expect(source).toContain('} from "./review_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
