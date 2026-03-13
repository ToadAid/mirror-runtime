import fs from "node:fs/promises";
import path from "node:path";
import { resolveMirrorMemoryDbPath } from "../../mirror-memory/db.js";
import {
  getUserReflection,
  listRecentObservations,
  listRecentRetrievalHistory,
} from "../../mirror-memory/repository.js";
import {
  ensureScrollIndexUpToDate,
  resolveDefaultLoreRoot,
  type MirrorScrollIndexEntry,
} from "../lore_sources/index.js";
import { loadSymbolRegistry, type MirrorSymbolRegistryEntry } from "./symbol_registry.js";
import type {
  MirrorLoreHelperIndexes,
  MirrorMemoryContext,
  MirrorMemoryContextObservation,
  MirrorLoreRetrievalCandidate,
  MirrorLoreRetrievalResult,
  MirrorLoreSupersedesEntry,
  RetrieveCanonicalScrollsOptions,
} from "./types.js";

const DEFAULT_LIMIT = 8;
const WORD_PATTERN = /[a-z0-9$]+/g;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  const matches = normalizeText(value).match(WORD_PATTERN) ?? [];
  return Array.from(new Set(matches.filter((token) => token.length >= 2)));
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildSearchText(entry: MirrorScrollIndexEntry): string {
  return normalizeText(
    `${entry.scroll_id} ${entry.title} ${entry.path} ${entry.keywords.join(" ")}`,
  );
}

function addReason(reasons: string[], value: string): void {
  if (!reasons.includes(value)) {
    reasons.push(value);
  }
}

async function loadMemoryContext(query: string, userId?: string): Promise<MirrorMemoryContext> {
  const dbPath = resolveMirrorMemoryDbPath();
  try {
    await fs.stat(dbPath);
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code === "ENOENT") {
      return {
        observations: [],
        userReflection: null,
        retrievalHistory: [],
      };
    }
    throw error;
  }

  const queryTokens = tokenize(query);
  const observations = listRecentObservations(20)
    .map((observation): MirrorMemoryContextObservation => {
      const text = normalizeText(`${observation.topic} ${observation.content}`);
      const score = queryTokens.filter((token) => text.includes(token)).length * 3;
      return {
        id: observation.id,
        topic: observation.topic,
        content: observation.content,
        score,
        source_type: observation.source_type,
        confidence: observation.confidence,
      };
    })
    .filter((observation) => observation.score > 0)
    .toSorted((a, b) => b.score - a.score || b.id - a.id)
    .slice(0, 5);

  return {
    observations,
    userReflection: userId ? getUserReflection(userId) : null,
    retrievalHistory: listRecentRetrievalHistory(userId, 5),
  };
}

export function resolveLoreRetrievalRoot(explicitDir?: string): string {
  return resolveDefaultLoreRoot(explicitDir);
}

export async function loadLoreHelperIndexes(
  explicitDir?: string,
): Promise<MirrorLoreHelperIndexes> {
  const loreDir = resolveLoreRetrievalRoot(explicitDir);
  const ensuredIndex = await ensureScrollIndexUpToDate(loreDir);
  const indexDir = path.join(loreDir, "_index");

  const [factUpdates, keywordIndex, supersedes, scrollIndex, symbolRegistry] = await Promise.all([
    readOptionalText(path.join(indexDir, "FACT_UPDATES.md")),
    readJsonFile<Record<string, string[]>>(path.join(indexDir, "KEYWORD_INDEX.json"), {}),
    readJsonFile<Record<string, MirrorLoreSupersedesEntry>>(
      path.join(indexDir, "SUPERSEDES.json"),
      {},
    ),
    readJsonFile<MirrorScrollIndexEntry[]>(path.join(indexDir, "scroll_index.json"), []),
    loadSymbolRegistry(),
  ]);

  return {
    loreDir,
    ensuredIndex,
    factUpdates,
    keywordIndex,
    supersedes,
    scrollIndex,
    symbolRegistry,
  };
}

function findMatchedSymbols(
  query: string,
  registry: MirrorSymbolRegistryEntry[],
): Array<{ symbol: string; label: string; concepts: string[] }> {
  const normalizedQuery = normalizeText(query);
  return registry
    .filter((entry) => {
      if (normalizedQuery.includes(entry.symbol)) {
        return true;
      }
      return entry.concepts.some((concept) => normalizedQuery.includes(normalizeText(concept)));
    })
    .map((entry) => ({
      symbol: entry.symbol,
      label: entry.label,
      concepts: entry.concepts,
    }));
}

export async function retrieveCanonicalScrolls(
  query: string,
  opts: RetrieveCanonicalScrollsOptions = {},
): Promise<MirrorLoreRetrievalResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const indexes = await loadLoreHelperIndexes(opts.loreDir);
  const memory = await loadMemoryContext(query, opts.userId);
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const matchedKeywordEntries = Object.entries(indexes.keywordIndex)
    .filter(([keyword]) => {
      const normalizedKeyword = normalizeText(keyword);
      return (
        normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery)
      );
    })
    .map(([keyword, files]) => ({ keyword, files }));
  const matchedSymbols = findMatchedSymbols(query, indexes.symbolRegistry);

  const keywordHitPaths = new Map<string, string[]>();
  for (const match of matchedKeywordEntries) {
    for (const file of match.files) {
      const existing = keywordHitPaths.get(file) ?? [];
      if (!existing.includes(match.keyword)) {
        existing.push(match.keyword);
      }
      keywordHitPaths.set(file, existing);
    }
  }

  const factUpdatesText = normalizeText(indexes.factUpdates ?? "");
  const scrollContentCache = new Map<string, string>();

  const rankedCandidates = await Promise.all(
    indexes.scrollIndex.map(async (entry): Promise<MirrorLoreRetrievalCandidate> => {
      const reasons: string[] = [];
      const canonNotes: string[] = [];
      let score = 0;
      const searchText = buildSearchText(entry);
      const searchTokens = new Set(tokenize(searchText));
      const keywordHits = keywordHitPaths.get(entry.path) ?? [];

      if (keywordHits.length > 0) {
        score += 30 + keywordHits.length * 4;
        addReason(reasons, `keyword_index:${keywordHits.join(",")}`);
      }

      if (searchText.includes(normalizedQuery) && normalizedQuery.length > 0) {
        score += 12;
        addReason(reasons, "direct_query_match");
      }

      const overlap = queryTokens.filter((token) => searchTokens.has(token));
      if (overlap.length > 0) {
        score += overlap.length * 3;
        addReason(reasons, `token_overlap:${overlap.join(",")}`);
      }

      const supersedes = indexes.supersedes[entry.path];
      if (supersedes) {
        const supersedesText = normalizeText(
          `${supersedes.supersedes_topics.join(" ")} ${supersedes.notes}`,
        );
        const supersedesOverlap = queryTokens.filter((token) => supersedesText.includes(token));

        if (supersedesOverlap.length > 0 || keywordHits.length > 0) {
          score += 18;
          addReason(reasons, "supersedes_topic_match");
          canonNotes.push(supersedes.notes);
        }
      }

      if (factUpdatesText.includes(normalizeText(path.basename(entry.path)))) {
        score += 6;
        addReason(reasons, "fact_updates_reference");
      }

      if (matchedSymbols.length > 0) {
        let content = scrollContentCache.get(entry.path);
        if (content === undefined) {
          content = normalizeText(
            await fs.readFile(path.join(indexes.loreDir, entry.path), "utf8"),
          );
          scrollContentCache.set(entry.path, content);
        }

        const symbolHits = matchedSymbols.filter((symbol) => content.includes(symbol.symbol));
        if (symbolHits.length > 0) {
          score += symbolHits.length * 20;
          addReason(reasons, `symbol_match:${symbolHits.map((hit) => hit.symbol).join(",")}`);
        }
      }

      return {
        scroll_id: entry.scroll_id,
        title: entry.title,
        path: entry.path,
        score,
        reasons,
        supersedes_topics: supersedes?.supersedes_topics ?? [],
        canon_notes: canonNotes,
      };
    }),
  );

  const ranked = rankedCandidates
    .filter((candidate) => candidate.score > 0)
    .toSorted((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.path.localeCompare(b.path);
    })
    .slice(0, limit);

  return {
    candidates: ranked,
    memory,
    diagnostics: {
      loreDir: indexes.loreDir,
      indexPath: indexes.ensuredIndex.indexPath,
      indexState: indexes.ensuredIndex.reason,
      totalIndexed: indexes.scrollIndex.length,
      query,
      queryTokens,
      matchedKeywordEntries,
      matchedSymbols,
      factUpdatesLoaded: indexes.factUpdates !== null,
      memoryLoaded:
        memory.observations.length > 0 ||
        memory.userReflection !== null ||
        memory.retrievalHistory.length > 0,
      returnedObservations: memory.observations.length,
      returnedCandidates: ranked.length,
    },
  };
}
