import fs from "node:fs/promises";
import path from "node:path";
import {
  loadLoreHelperIndexes,
  resolveLoreRetrievalRoot,
  retrieveCanonicalScrolls,
} from "../../lore_retrieval/index.js";

export type CanonFactInput = {
  query: string;
  user_id?: string;
};

export type CanonFactResult = {
  query: string;
  canonical_fact: string;
  source_scroll_id: string;
  title: string;
  path: string;
  supersession_note?: string;
  fact_update_reference?: string;
  diagnostics?: {
    index_state: string;
    matched_keywords: string[];
    matched_symbols: string[];
  };
};

function validateInput(input: CanonFactInput): CanonFactInput {
  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    throw new TypeError("canon-fact requires a non-empty query");
  }
  if (input.user_id !== undefined && typeof input.user_id !== "string") {
    throw new TypeError("canon-fact user_id must be a string when provided");
  }
  return input;
}

function extractFactUpdateStatements(raw: string): Map<string, string> {
  const statements = new Map<string, string>();
  const sections = raw.split(/\n---+\n/);

  for (const section of sections) {
    const referenceMatch = /Reference scroll:\s*\n([^\n]+)/i.exec(section);
    const statusMatch =
      /Current canonical status:\s*\n+([^\n][\s\S]*?)(?:\n{2,}Reference scroll:|$)/i.exec(section);
    if (!referenceMatch || !statusMatch) {
      continue;
    }
    const reference = referenceMatch[1]?.trim();
    const statement = statusMatch[1]?.trim().replace(/\s+/g, " ");
    if (reference && statement) {
      statements.set(reference, statement);
    }
  }

  return statements;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---\n")) {
    return raw;
  }
  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return raw;
  }
  return raw.slice(end + 4).trim();
}

function extractCanonicalFactFromScroll(raw: string): string {
  const body = stripFrontmatter(raw);
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/^[A-Za-z0-9 _-]+:$/.test(line));

  const paragraph = lines.join(" ").replace(/\s+/g, " ").trim();
  return paragraph;
}

export async function canonFact(input: CanonFactInput): Promise<CanonFactResult> {
  const params = validateInput(input);
  const retrieval = await retrieveCanonicalScrolls(params.query, {
    userId: params.user_id,
    limit: 1,
  });
  const top = retrieval.candidates[0];
  if (!top) {
    throw new Error("canon-fact found no canonical scroll candidate");
  }

  const loreDir = resolveLoreRetrievalRoot();
  const helperIndexes = await loadLoreHelperIndexes(loreDir);
  const factUpdates = extractFactUpdateStatements(helperIndexes.factUpdates ?? "");
  const rawScroll = await fs.readFile(path.join(loreDir, top.path), "utf8");

  const factUpdateReference = factUpdates.get(top.path);
  const canonicalFact = factUpdateReference ?? extractCanonicalFactFromScroll(rawScroll);

  return {
    query: params.query,
    canonical_fact: canonicalFact,
    source_scroll_id: top.scroll_id,
    title: top.title,
    path: top.path,
    supersession_note: top.canon_notes[0],
    fact_update_reference: factUpdateReference,
    diagnostics:
      retrieval.diagnostics.matchedKeywordEntries.length > 0 ||
      retrieval.diagnostics.matchedSymbols.length > 0
        ? {
            index_state: retrieval.diagnostics.indexState,
            matched_keywords: retrieval.diagnostics.matchedKeywordEntries.map(
              (entry) => entry.keyword,
            ),
            matched_symbols: retrieval.diagnostics.matchedSymbols.map((entry) => entry.symbol),
          }
        : undefined,
  };
}
