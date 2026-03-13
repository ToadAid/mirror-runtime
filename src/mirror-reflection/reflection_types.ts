import type { MirrorSymbolRegistryEntry } from "../mirror/lore_retrieval/index.js";
import type { MirrorLoreRetrievalCandidate } from "../mirror/lore_retrieval/types.js";
import type { MirrorLoreValidationReport } from "../mirror/lore_validation/index.js";

export type MirrorCanonTheme = {
  theme: string;
  score: number;
  supporting_scrolls: string[];
};

export type MirrorScrollCluster = {
  label: string;
  scrolls: string[];
};

export type MirrorPotentialConflict = {
  type: "candidate_overlap" | "supersession" | "narrative_duplicate";
  message: string;
  related_scrolls: string[];
};

export type MirrorSymbolResonance = {
  symbols: Array<{
    symbol: string;
    count: number;
    related_scrolls: string[];
    concepts: string[];
  }>;
  hints: string[];
};

export type MirrorCanonReflection = {
  themes: MirrorCanonTheme[];
  symbolic_resonance: MirrorSymbolResonance;
  scroll_clusters: MirrorScrollCluster[];
  potential_conflicts: MirrorPotentialConflict[];
};

export type MirrorDraftReview = {
  validation: MirrorLoreValidationReport | null;
  overlap_candidates: Array<{
    candidate: MirrorLoreRetrievalCandidate;
    similarity: number;
  }>;
  suggested_symbols: string[];
  supersession_hints: string[];
  potential_conflicts: MirrorPotentialConflict[];
};

export type ReflectCanonInput = {
  query: string;
  loreDir: string;
  candidates: MirrorLoreRetrievalCandidate[];
  matchedSymbols: Array<{
    symbol: string;
    label: string;
    concepts: string[];
  }>;
};

export type ReviewDraftInput = {
  loreDir: string;
  draftContent: string;
  draftPath?: string;
  candidates: MirrorLoreRetrievalCandidate[];
  symbolRegistry: MirrorSymbolRegistryEntry[];
  validation?: MirrorLoreValidationReport | null;
};
