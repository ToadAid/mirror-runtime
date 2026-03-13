import type {
  ObservationRecord,
  RetrievalHistoryRecord,
  UserReflectionRecord,
} from "../../mirror-memory/types.js";
import type {
  MirrorScrollIndexEntry,
  MirrorScrollIndexEnsureResult,
} from "../lore_sources/scroll_index.js";
import type { MirrorSymbolRegistryEntry } from "./symbol_registry.js";

export type MirrorLoreSupersedesEntry = {
  supersedes_topics: string[];
  notes: string;
};

export type MirrorLoreHelperIndexes = {
  loreDir: string;
  ensuredIndex: MirrorScrollIndexEnsureResult;
  factUpdates: string | null;
  keywordIndex: Record<string, string[]>;
  supersedes: Record<string, MirrorLoreSupersedesEntry>;
  scrollIndex: MirrorScrollIndexEntry[];
  symbolRegistry: MirrorSymbolRegistryEntry[];
};

export type MirrorLoreRetrievalCandidate = {
  scroll_id: string;
  title: string;
  path: string;
  score: number;
  reasons: string[];
  supersedes_topics: string[];
  canon_notes: string[];
};

export type MirrorLoreRetrievalDiagnostics = {
  loreDir: string;
  indexPath: string;
  indexState: MirrorScrollIndexEnsureResult["reason"];
  totalIndexed: number;
  query: string;
  queryTokens: string[];
  matchedKeywordEntries: Array<{
    keyword: string;
    files: string[];
  }>;
  matchedSymbols: Array<{
    symbol: string;
    label: string;
    concepts: string[];
  }>;
  factUpdatesLoaded: boolean;
  memoryLoaded: boolean;
  returnedObservations: number;
  returnedCandidates: number;
};

export type MirrorMemoryContextObservation = {
  id: number;
  topic: string;
  content: string;
  score: number;
  source_type: ObservationRecord["source_type"];
  confidence: number | null;
};

export type MirrorMemoryContext = {
  observations: MirrorMemoryContextObservation[];
  userReflection: UserReflectionRecord | null;
  retrievalHistory: RetrievalHistoryRecord[];
};

export type MirrorLoreRetrievalResult = {
  candidates: MirrorLoreRetrievalCandidate[];
  memory: MirrorMemoryContext;
  diagnostics: MirrorLoreRetrievalDiagnostics;
};

export type RetrieveCanonicalScrollsOptions = {
  loreDir?: string;
  limit?: number;
  userId?: string;
};
