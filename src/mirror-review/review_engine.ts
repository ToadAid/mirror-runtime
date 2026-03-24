import {
  getCurrentMirrorObservabilityContext,
  type MirrorObservabilityContext,
} from "../mirror-observability/index.js";
import { retrieveCanonicalScrolls } from "../mirror/lore_retrieval/index.js";
import { detectCanonConflicts } from "./canon_conflict.js";
import { detectNarrativeSimilarity } from "./narrative_similarity.js";
import { MIRROR_REVIEW_RULES } from "./review_rules.js";
import type { MirrorCanonReviewResult, MirrorReviewStatus } from "./review_types.js";
import { validateDraftSymbols } from "./symbol_validation.js";

export type MirrorReviewObservability = Pick<
  MirrorObservabilityContext,
  "incrementMetric" | "logEvent"
>;

function deriveStatus(params: {
  conflicts: MirrorCanonReviewResult["conflicts"];
  similarities: MirrorCanonReviewResult["similarities"];
  symbolValidation: MirrorCanonReviewResult["symbol_validation"];
}): MirrorReviewStatus {
  if (
    params.conflicts.length > 0 ||
    params.symbolValidation.unknown_symbols.length > 0 ||
    params.symbolValidation.mismatched_symbols.length > 0
  ) {
    return "conflict_detected";
  }

  if (
    params.symbolValidation.overused_symbols.length > 0 ||
    params.similarities.some(
      (similarity) => similarity.similarity_score >= MIRROR_REVIEW_RULES.reviewSimilarityThreshold,
    )
  ) {
    return "needs_review";
  }

  return "approved";
}

export async function reviewDraftForCanon(
  params: {
    loreDir: string;
    draftContent: string;
  },
  deps: { observability?: MirrorReviewObservability } = {},
): Promise<MirrorCanonReviewResult> {
  const observability = deps.observability ?? getCurrentMirrorObservabilityContext();
  const retrieval = await retrieveCanonicalScrolls(params.draftContent, {
    loreDir: params.loreDir,
    limit: 5,
  });
  const similarities = await detectNarrativeSimilarity({
    loreDir: params.loreDir,
    draftContent: params.draftContent,
    candidates: retrieval.candidates,
  });
  const conflicts = await detectCanonConflicts({
    loreDir: params.loreDir,
    draftContent: params.draftContent,
    candidates: retrieval.candidates,
    similarities,
  });
  const symbol_validation = await validateDraftSymbols(params.draftContent);
  const status = deriveStatus({
    conflicts,
    similarities,
    symbolValidation: symbol_validation,
  });

  if (status === "conflict_detected") {
    observability.incrementMetric("review_conflicts");
  }
  observability.logEvent("review.decision", {
    status,
    conflicts: conflicts.length,
    similarities: similarities.length,
  });

  const diagnostics: string[] = [];
  if (conflicts.length > 0) {
    diagnostics.push(...conflicts.map((conflict) => conflict.message));
  }
  if (symbol_validation.unknown_symbols.length > 0) {
    diagnostics.push(`unknown symbols: ${symbol_validation.unknown_symbols.join(", ")}`);
  }
  if (symbol_validation.overused_symbols.length > 0) {
    diagnostics.push(`overused symbols: ${symbol_validation.overused_symbols.join(", ")}`);
  }

  return {
    status,
    conflicts,
    similarities,
    symbol_validation,
    diagnostics,
  };
}
