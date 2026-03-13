import type { MirrorLoreGraphEdge } from "./edge_types.js";
import type { MirrorLoreGraphNode } from "./node_types.js";

export type MirrorLoreGraph = {
  loreDir: string;
  nodes: MirrorLoreGraphNode[];
  edges: MirrorLoreGraphEdge[];
};
