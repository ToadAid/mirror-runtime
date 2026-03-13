import fs from "node:fs/promises";
import path from "node:path";
import type { MirrorLoreRetrievalCandidate } from "../mirror/lore_retrieval/types.js";
import type { MirrorNarrativeSimilarity } from "./review_types.js";

const WORD_PATTERN = /[a-z0-9$]+/g;

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(WORD_PATTERN)
      ?.filter((token) => token.length >= 3) ?? []
  );
}

function similarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftSet.size, rightSet.size);
}

function extractHeading(raw: string): string {
  const match = /^#\s+(.+)$/m.exec(raw);
  return match?.[1]?.trim() ?? "";
}

export async function detectNarrativeSimilarity(params: {
  loreDir: string;
  draftContent: string;
  candidates: MirrorLoreRetrievalCandidate[];
}): Promise<MirrorNarrativeSimilarity[]> {
  const draftTokens = tokenize(params.draftContent);
  const draftHeading = extractHeading(params.draftContent);
  const phraseTokens = tokenize(
    params.draftContent
      .split(/\n{2,}/)
      .slice(0, 3)
      .join(" "),
  );

  const similarities = await Promise.all(
    params.candidates.map(async (candidate): Promise<MirrorNarrativeSimilarity> => {
      const raw = await fs.readFile(path.join(params.loreDir, candidate.path), "utf8");
      const candidateTokens = tokenize(raw);
      const candidateHeading = extractHeading(raw);
      const candidatePhraseTokens = tokenize(
        raw
          .split(/\n{2,}/)
          .slice(0, 3)
          .join(" "),
      );

      const heading_similarity = similarity(tokenize(draftHeading), tokenize(candidateHeading));
      const phrase_overlap = similarity(phraseTokens, candidatePhraseTokens);
      const concept_overlap = similarity(draftTokens, candidateTokens);
      const similarity_score =
        heading_similarity * 0.25 + phrase_overlap * 0.35 + concept_overlap * 0.4;

      return {
        candidate,
        heading_similarity,
        phrase_overlap,
        concept_overlap,
        similarity_score,
      };
    }),
  );

  return similarities.toSorted(
    (a, b) =>
      b.similarity_score - a.similarity_score || a.candidate.path.localeCompare(b.candidate.path),
  );
}
