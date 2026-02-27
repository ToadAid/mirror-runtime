/**
 * @fileoverview Lore Forge Type Definitions
 */

export interface LoreCandidate {
  id: string;
  content: string;
  tags: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ScoredCandidate {
  candidate: LoreCandidate;
  score: number;
  reason?: string;
}

export interface ScoringParams {
  minScore?: number;
  maxScore?: number;
  includeReason?: boolean;
}

export interface BundleConfig {
  format: 'json' | 'jsonl' | 'markdown';
  outputPath?: string;
}

// Library-only types, no runtime behavior