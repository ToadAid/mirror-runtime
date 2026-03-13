export type MirrorLoreGraphEdgeType =
  | "references"
  | "shares_symbol"
  | "similar_narrative"
  | "supersedes"
  | "echoes";

export type MirrorLoreGraphEdge = {
  from: string;
  to: string;
  type: MirrorLoreGraphEdgeType;
  weight?: number;
};
