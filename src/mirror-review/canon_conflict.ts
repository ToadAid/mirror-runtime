import fs from "node:fs/promises";
import path from "node:path";
import type { MirrorLoreRetrievalCandidate } from "../mirror/lore_retrieval/types.js";
import { MIRROR_REVIEW_RULES } from "./review_rules.js";
import type { MirrorCanonConflict, MirrorNarrativeSimilarity } from "./review_types.js";

const NEGATION_PATTERN = /\b(no|not|never|cancelled|canceled|without|ended)\b/i;

function hasNegation(value: string): boolean {
  return NEGATION_PATTERN.test(value);
}

export async function detectCanonConflicts(params: {
  loreDir: string;
  draftContent: string;
  candidates: MirrorLoreRetrievalCandidate[];
  similarities: MirrorNarrativeSimilarity[];
}): Promise<MirrorCanonConflict[]> {
  const conflicts: MirrorCanonConflict[] = [];
  const draftNegated = hasNegation(params.draftContent);

  for (const similarity of params.similarities) {
    if (similarity.similarity_score < MIRROR_REVIEW_RULES.reviewSimilarityThreshold) {
      continue;
    }

    const raw = await fs.readFile(path.join(params.loreDir, similarity.candidate.path), "utf8");
    const canonNegated = hasNegation(raw);

    if (
      similarity.similarity_score >= MIRROR_REVIEW_RULES.reviewSimilarityThreshold &&
      draftNegated !== canonNegated
    ) {
      conflicts.push({
        type: "contradiction",
        message: `Draft may contradict nearby canon in ${similarity.candidate.path}`,
        related_scrolls: [similarity.candidate.path],
      });
    }

    if (similarity.candidate.canon_notes.length > 0) {
      conflicts.push({
        type: "supersession_chain",
        message: similarity.candidate.canon_notes[0] ?? "Supersession chain detected.",
        related_scrolls: [similarity.candidate.path],
      });
    }
  }

  return conflicts;
}
