import fs from "node:fs/promises";
import path from "node:path";
import { retrieveCanonicalScrolls } from "../mirror/lore_retrieval/index.js";
import type { MirrorSymbolRegistryEntry } from "../mirror/lore_retrieval/index.js";
import { validateLoreDraftInCorpusContext } from "../mirror/lore_validation/index.js";
import type { MirrorDraftReview, ReviewDraftInput } from "./reflection_types.js";

const WORD_PATTERN = /[a-z0-9$]+/g;

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(WORD_PATTERN)
      ?.filter((token) => token.length >= 3) ?? []
  );
}

function similarityScore(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function suggestSymbols(
  draftContent: string,
  symbolRegistry: MirrorSymbolRegistryEntry[],
): string[] {
  const tokens = new Set(tokenize(draftContent));
  return symbolRegistry
    .filter((entry) =>
      entry.concepts.some((concept) => tokenize(concept).some((t) => tokens.has(t))),
    )
    .map((entry) => entry.symbol);
}

export async function reviewDraftAgainstCanon(input: ReviewDraftInput): Promise<MirrorDraftReview> {
  const validation =
    input.validation ??
    (await validateLoreDraftInCorpusContext({
      loreDir: input.loreDir,
      draftPath: input.draftPath ?? "TOBY_L0000_DraftReview.md",
      draftContent: input.draftContent,
    }));

  const retrieval = await retrieveCanonicalScrolls(input.draftContent, {
    loreDir: input.loreDir,
    limit: 5,
  });

  const overlapCandidates = [];
  const potentialConflicts = [];
  const supersessionHints: string[] = [];

  for (const candidate of retrieval.candidates) {
    const raw = await fs.readFile(path.join(input.loreDir, candidate.path), "utf8");
    const similarity = similarityScore(input.draftContent, raw);
    overlapCandidates.push({ candidate, similarity });
    if (similarity >= 0.2) {
      potentialConflicts.push({
        type: "narrative_duplicate" as const,
        message: `Draft overlaps existing canon narrative in ${candidate.path}`,
        related_scrolls: [candidate.path],
      });
    }
    if (candidate.canon_notes.length > 0) {
      supersessionHints.push(...candidate.canon_notes);
    }
  }

  return {
    validation,
    overlap_candidates: overlapCandidates.toSorted((a, b) => b.similarity - a.similarity),
    suggested_symbols: suggestSymbols(input.draftContent, input.symbolRegistry),
    supersession_hints: Array.from(new Set(supersessionHints)),
    potential_conflicts: potentialConflicts,
  };
}
