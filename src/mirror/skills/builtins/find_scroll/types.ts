export type FindScrollInput = {
  query: string;
  user_id?: string;
  limit?: number;
};

export type FindScrollResult = {
  query: string;
  candidates: Array<{
    title: string;
    path: string;
    score: number;
    reason_summary: string;
    matched_keywords: string[];
    matched_symbols: string[];
    canon_notes: string[];
    supersedes_topics: string[];
  }>;
  matched_keywords: string[];
  matched_symbols: string[];
};
