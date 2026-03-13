import type { MirrorLoreRetrievalCandidate } from "../mirror/lore_retrieval/types.js";

export type MirrorReviewStatus = "approved" | "needs_review" | "conflict_detected";

export type MirrorCanonConflict = {
  type: "contradiction" | "supersession_chain";
  message: string;
  related_scrolls: string[];
};

export type MirrorNarrativeSimilarity = {
  candidate: MirrorLoreRetrievalCandidate;
  heading_similarity: number;
  phrase_overlap: number;
  concept_overlap: number;
  similarity_score: number;
};

export type MirrorSymbolValidation = {
  unknown_symbols: string[];
  overused_symbols: string[];
  mismatched_symbols: Array<{
    symbol: string;
    message: string;
  }>;
};

export type MirrorCanonReviewResult = {
  status: MirrorReviewStatus;
  conflicts: MirrorCanonConflict[];
  similarities: MirrorNarrativeSimilarity[];
  symbol_validation: MirrorSymbolValidation;
  diagnostics: string[];
};
