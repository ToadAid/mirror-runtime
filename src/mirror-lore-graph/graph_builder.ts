import fs from "node:fs/promises";
import path from "node:path";
import { detectNarrativeSimilarity } from "../mirror-review/index.js";
import { loadSymbolRegistry, resolveLoreRetrievalRoot } from "../mirror/lore_retrieval/index.js";
import { ensureScrollIndexUpToDate } from "../mirror/lore_sources/scroll_index.js";
import type { MirrorScrollIndexEntry } from "../mirror/lore_sources/scroll_index.js";
import type { MirrorLoreGraphEdge } from "./edge_types.js";
import type { MirrorLoreGraph } from "./lore_graph.js";
import type { MirrorLoreGraphNode } from "./node_types.js";

const WORD_PATTERN = /[a-z0-9$]+/g;

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(WORD_PATTERN)
      ?.filter((token) => token.length >= 3) ?? []
  );
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

function scrollNodeId(entry: MirrorScrollIndexEntry): string {
  return `scroll:${entry.path}`;
}

function symbolNodeId(symbol: string): string {
  return `symbol:${symbol}`;
}

function conceptNodeId(concept: string): string {
  return `concept:${concept}`;
}

function addEdge(edges: MirrorLoreGraphEdge[], edge: MirrorLoreGraphEdge): void {
  if (
    !edges.some(
      (existing) =>
        existing.from === edge.from && existing.to === edge.to && existing.type === edge.type,
    )
  ) {
    edges.push(edge);
  }
}

function extractScrollReferences(raw: string, entries: MirrorScrollIndexEntry[]): string[] {
  const references = new Set<string>();
  for (const entry of entries) {
    if (raw.includes(entry.scroll_id) || raw.includes(entry.path)) {
      references.add(entry.path);
    }
  }
  return [...references];
}

export async function buildLoreGraph(explicitLoreDir?: string): Promise<MirrorLoreGraph> {
  const loreDir = resolveLoreRetrievalRoot(explicitLoreDir);
  await ensureScrollIndexUpToDate(loreDir);
  const indexPath = path.join(loreDir, "_index", "scroll_index.json");
  const supersedesPath = path.join(loreDir, "_index", "SUPERSEDES.json");
  const scrollIndex = await readJsonFile<MirrorScrollIndexEntry[]>(indexPath, []);
  const supersedes = await readJsonFile<
    Record<string, { supersedes_topics: string[]; notes: string }>
  >(supersedesPath, {});
  const symbolRegistry = await loadSymbolRegistry();

  const nodes: MirrorLoreGraphNode[] = [];
  const edges: MirrorLoreGraphEdge[] = [];
  const contentByPath = new Map<string, string>();

  for (const entry of scrollIndex) {
    nodes.push({
      id: scrollNodeId(entry),
      type: "scroll",
      label: entry.title,
      path: entry.path,
      scroll_id: entry.scroll_id,
    });
  }

  for (const entry of symbolRegistry) {
    nodes.push({
      id: symbolNodeId(entry.symbol),
      type: "symbol",
      label: entry.label,
      symbol: entry.symbol,
    });
    for (const concept of entry.concepts) {
      if (!nodes.some((node) => node.id === conceptNodeId(concept))) {
        nodes.push({
          id: conceptNodeId(concept),
          type: "concept",
          label: concept,
          concept,
        });
      }
    }
  }

  for (const entry of scrollIndex) {
    const raw = await fs.readFile(path.join(loreDir, entry.path), "utf8");
    contentByPath.set(entry.path, raw);

    for (const ref of extractScrollReferences(raw, scrollIndex)) {
      if (ref !== entry.path) {
        addEdge(edges, {
          from: scrollNodeId(entry),
          to: `scroll:${ref}`,
          type: "references",
        });
      }
    }

    for (const symbol of symbolRegistry) {
      if (raw.includes(symbol.symbol)) {
        addEdge(edges, {
          from: scrollNodeId(entry),
          to: symbolNodeId(symbol.symbol),
          type: "shares_symbol",
        });
        for (const concept of symbol.concepts) {
          addEdge(edges, {
            from: scrollNodeId(entry),
            to: conceptNodeId(concept),
            type: "echoes",
          });
        }
      }
    }
  }

  for (const [pathKey, entry] of Object.entries(supersedes)) {
    const source = scrollIndex.find((item) => item.path === pathKey);
    if (!source) {
      continue;
    }
    for (const topic of entry.supersedes_topics) {
      const topicTokens = tokenize(topic);
      const target = scrollIndex.find((candidate) => {
        if (candidate.path === source.path) {
          return false;
        }
        const candidateText = `${candidate.title} ${candidate.keywords.join(" ")}`.toLowerCase();
        return topicTokens.some((token) => candidateText.includes(token));
      });
      if (target) {
        addEdge(edges, {
          from: scrollNodeId(source),
          to: scrollNodeId(target),
          type: "supersedes",
        });
      }
    }
  }

  for (const entry of scrollIndex) {
    const candidates = scrollIndex
      .filter((candidate) => candidate.path !== entry.path)
      .map((candidate) => ({
        scroll_id: candidate.scroll_id,
        title: candidate.title,
        path: candidate.path,
        score: 0,
        reasons: [],
        supersedes_topics: [],
        canon_notes: [],
      }));
    const similarities = await detectNarrativeSimilarity({
      loreDir,
      draftContent: contentByPath.get(entry.path) ?? "",
      candidates,
    });

    for (const similarity of similarities.slice(0, 3)) {
      if (similarity.similarity_score < 0.2) {
        continue;
      }
      addEdge(edges, {
        from: scrollNodeId(entry),
        to: scrollNodeId({
          scroll_id: similarity.candidate.scroll_id,
          title: similarity.candidate.title,
          path: similarity.candidate.path,
          keywords: [],
        }),
        type: "similar_narrative",
        weight: similarity.similarity_score,
      });
    }
  }

  return {
    loreDir,
    nodes,
    edges,
  };
}
