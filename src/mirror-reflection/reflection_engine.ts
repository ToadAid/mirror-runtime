import { buildLoreGraph, findConceptClusters } from "../mirror-lore-graph/index.js";
import { loadSymbolRegistry } from "../mirror/lore_retrieval/index.js";
import { analyzeCanonContext } from "./canon_analysis.js";
import { reviewDraftAgainstCanon } from "./draft_review.js";
import type {
  MirrorCanonReflection,
  MirrorDraftReview,
  ReflectCanonInput,
} from "./reflection_types.js";
import { analyzeSymbolResonance } from "./symbol_analysis.js";

function formatReflection(reflection: MirrorCanonReflection): string {
  const parts = [
    "Mirror reflection analysis:",
    `themes=${reflection.themes.map((theme) => theme.theme).join(", ") || "none"}`,
    `clusters=${reflection.scroll_clusters.map((cluster) => cluster.label).join(", ") || "none"}`,
  ];

  if (reflection.symbolic_resonance.hints.length > 0) {
    parts.push(`symbolic_resonance=${reflection.symbolic_resonance.hints.join(" | ")}`);
  }
  if (reflection.potential_conflicts.length > 0) {
    parts.push(
      `potential_conflicts=${reflection.potential_conflicts.map((item) => item.message).join(" | ")}`,
    );
  }

  return parts.join("\n");
}

export async function reflectOnCanonContext(
  input: ReflectCanonInput,
): Promise<MirrorCanonReflection> {
  const base = await analyzeCanonContext(input);
  const symbolic_resonance = await analyzeSymbolResonance(input);
  const graph = await buildLoreGraph(input.loreDir);
  const conceptClusters = findConceptClusters(graph)
    .filter((cluster) =>
      base.themes.some(
        (theme) => cluster.concept.includes(theme.theme) || theme.theme.includes(cluster.concept),
      ),
    )
    .slice(0, 3)
    .map((cluster) => ({
      label: `concept:${cluster.concept}`,
      scrolls: cluster.scrolls,
    }));
  return {
    ...base,
    symbolic_resonance,
    scroll_clusters: [...base.scroll_clusters, ...conceptClusters],
  };
}

export async function reviewCanonDraft(params: {
  loreDir: string;
  draftContent: string;
  draftPath?: string;
}): Promise<MirrorDraftReview> {
  const symbolRegistry = await loadSymbolRegistry();
  return reviewDraftAgainstCanon({
    loreDir: params.loreDir,
    draftContent: params.draftContent,
    draftPath: params.draftPath,
    candidates: [],
    symbolRegistry,
  });
}

export function buildReflectionPrompt(reflection: MirrorCanonReflection): string {
  return formatReflection(reflection);
}
