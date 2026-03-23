import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone lore-graph entry surface", () => {
  it("keeps the canonical lore-graph-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-lore-graph/index.ts"),
      "utf8",
    );

    expect(source).toContain('export { buildLoreGraph } from "./graph_builder.js";');
    expect(source).toContain('export type { MirrorLoreGraph } from "./lore_graph.js";');
    expect(source).toContain('export type { MirrorLoreGraphNode } from "./node_types.js";');
    expect(source).toContain(
      'export type { MirrorLoreGraphEdge, MirrorLoreGraphEdgeType } from "./edge_types.js";',
    );
    expect(source).toContain("findConceptClusters");
    expect(source).toContain("findRelatedScrolls");
    expect(source).toContain("findScrollsSharingSymbols");
    expect(source).toContain("findSupersessionChains");
    expect(source).toContain('} from "./graph_query.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
