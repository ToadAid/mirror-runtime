import { retrieveCanonicalScrolls } from "../../lore_retrieval/index.js";

export type FindScrollInput = {
  query: string;
  user_id?: string;
  limit?: number;
};

export type FindScrollResult = {
  query: string;
  candidates: Array<{
    scroll_id: string;
    title: string;
    path: string;
    score: number;
    reason_summary: string;
    matched_keywords: string[];
    matched_symbols: string[];
    fact_update_notes: string[];
    supersession_notes: string[];
    supersedes_topics: string[];
  }>;
  diagnostics?: {
    matched_keywords: string[];
    matched_symbols: string[];
    index_state: string;
    total_indexed: number;
  };
};

function validateInput(input: FindScrollInput): FindScrollInput {
  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    throw new TypeError("find-scroll requires a non-empty query");
  }
  if (input.user_id !== undefined && typeof input.user_id !== "string") {
    throw new TypeError("find-scroll user_id must be a string when provided");
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit <= 0)) {
    throw new TypeError("find-scroll limit must be a positive integer when provided");
  }

  return {
    query: input.query,
    user_id: input.user_id,
    limit: input.limit ?? 5,
  };
}

export async function findScroll(input: FindScrollInput): Promise<FindScrollResult> {
  const params = validateInput(input);
  const retrieval = await retrieveCanonicalScrolls(params.query, {
    userId: params.user_id,
    limit: params.limit,
  });

  const matchedKeywords = retrieval.diagnostics.matchedKeywordEntries.map((entry) => entry.keyword);
  const matchedSymbols = retrieval.diagnostics.matchedSymbols.map((entry) => entry.symbol);

  return {
    query: params.query,
    candidates: retrieval.candidates.map((candidate) => ({
      scroll_id: candidate.scroll_id,
      title: candidate.title,
      path: candidate.path,
      score: candidate.score,
      reason_summary: candidate.reasons.join("; "),
      matched_keywords: matchedKeywords.filter((keyword) =>
        candidate.reasons.some((reason) => reason.includes(keyword)),
      ),
      matched_symbols: matchedSymbols.filter((symbol) =>
        candidate.reasons.some((reason) => reason.includes(symbol)),
      ),
      fact_update_notes: candidate.reasons.includes("fact_updates_reference")
        ? ["Referenced by FACT_UPDATES.md"]
        : [],
      supersession_notes: candidate.canon_notes,
      supersedes_topics: candidate.supersedes_topics,
    })),
    diagnostics:
      matchedKeywords.length > 0 || matchedSymbols.length > 0
        ? {
            matched_keywords: matchedKeywords,
            matched_symbols: matchedSymbols,
            index_state: retrieval.diagnostics.indexState,
            total_indexed: retrieval.diagnostics.totalIndexed,
          }
        : undefined,
  };
}
