import type { MirrorLoreGraph } from "./lore_graph.js";
import type { MirrorLoreGraphNode } from "./node_types.js";

function getNode(graph: MirrorLoreGraph, id: string): MirrorLoreGraphNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

function isScrollNode(
  node: MirrorLoreGraphNode | undefined,
): node is Extract<MirrorLoreGraphNode, { type: "scroll" }> {
  return node?.type === "scroll";
}

export function findRelatedScrolls(graph: MirrorLoreGraph, scrollId: string): string[] {
  const scrollNode = graph.nodes.find(
    (node) => node.type === "scroll" && (node.scroll_id === scrollId || node.path === scrollId),
  );
  if (!scrollNode) {
    return [];
  }

  const related = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from !== scrollNode.id && edge.to !== scrollNode.id) {
      continue;
    }
    const counterpart = getNode(graph, edge.from === scrollNode.id ? edge.to : edge.from);
    if (isScrollNode(counterpart)) {
      related.add(counterpart.path);
    }
  }
  return [...related];
}

export function findScrollsSharingSymbols(graph: MirrorLoreGraph, symbol: string): string[] {
  const symbolNode = graph.nodes.find((node) => node.type === "symbol" && node.symbol === symbol);
  if (!symbolNode) {
    return [];
  }

  const related = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== "shares_symbol") {
      continue;
    }
    if (edge.from !== symbolNode.id && edge.to !== symbolNode.id) {
      continue;
    }
    const counterpart = getNode(graph, edge.from === symbolNode.id ? edge.to : edge.from);
    if (isScrollNode(counterpart)) {
      related.add(counterpart.path);
    }
  }
  return [...related];
}

export function findConceptClusters(
  graph: MirrorLoreGraph,
): Array<{ concept: string; scrolls: string[] }> {
  const clusters: Array<{ concept: string; scrolls: string[] }> = [];

  for (const node of graph.nodes) {
    if (node.type !== "concept") {
      continue;
    }
    const scrolls = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.from !== node.id && edge.to !== node.id) {
        continue;
      }
      const counterpart = getNode(graph, edge.from === node.id ? edge.to : edge.from);
      if (isScrollNode(counterpart)) {
        scrolls.add(counterpart.path);
      }
    }
    if (scrolls.size > 0) {
      clusters.push({ concept: node.concept, scrolls: [...scrolls] });
    }
  }

  return clusters.toSorted(
    (a, b) => b.scrolls.length - a.scrolls.length || a.concept.localeCompare(b.concept),
  );
}

export function findSupersessionChains(graph: MirrorLoreGraph, scrollId: string): string[] {
  const start = graph.nodes.find(
    (node) => node.type === "scroll" && (node.scroll_id === scrollId || node.path === scrollId),
  );
  if (!start) {
    return [];
  }

  const chain: string[] = [];
  let currentId = start.id;
  const visited = new Set<string>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const edge = graph.edges.find(
      (candidate) => candidate.type === "supersedes" && candidate.from === currentId,
    );
    if (!edge) {
      break;
    }
    const next = getNode(graph, edge.to);
    if (!isScrollNode(next)) {
      break;
    }
    chain.push(next.path);
    currentId = next.id;
  }

  return chain;
}
