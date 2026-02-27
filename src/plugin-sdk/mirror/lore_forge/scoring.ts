/**
 * @fileoverview Lore Forge Scoring Functions (Library-Only)
 * @description Provides scoring utilities for lore candidates. No runtime hooks, no behavior change.
 */

import type { LoreCandidate, ScoredCandidate, ScoringParams } from './types';

/**
 * Basic scoring utility for lore candidates
 * @param candidate - Lore candidate to score
 * @param params - Scoring parameters
 * @returns Scored candidate result
 */
export function scoreCandidate(
  candidate: LoreCandidate,
  params: ScoringParams = {}
): ScoredCandidate {
  const { minScore = 0, maxScore = 100, includeReason = false } = params;

  // Simple scoring: 50 baseline + tag relevance
  const tagRelevance = candidate.tags.length * 10;
  const baseScore = 50;
  let finalScore = Math.min(baseScore + tagRelevance, maxScore);

  // Clamp to min/max
  finalScore = Math.max(finalScore, minScore);

  return includeReason
    ? {
        candidate,
        score: finalScore,
        reason: `Based on ${candidate.tags.length} tags`,
      }
    : { candidate, score: finalScore };
}

/**
 * Batch scoring for multiple candidates
 * @param candidates - Array of candidates
 * @param params - Scoring parameters
 * @returns Array of scored candidates
 */
export function scoreCandidates(
  candidates: LoreCandidate[],
  params: ScoringParams = {}
): ScoredCandidate[] {
  return candidates.map((c) => scoreCandidate(c, params));
}

// Library-only: No runtime hooks, no behavior change