/**
 * @fileoverview Lore Forge Bundle Exports
 * @description Provides bundle generation utilities for lore candidates.
 */

import type { BundleConfig, ScoredCandidate } from "./types.js";

/**
 * Create a JSON bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (unused)
 * @returns JSON string bundle
 */
export function createJsonBundle(scored: ScoredCandidate[], _config: BundleConfig): string {
  return JSON.stringify(scored, null, 2);
}

/**
 * Create a JSONL bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (unused)
 * @returns JSONL string bundle
 */
export function createJsonlBundle(scored: ScoredCandidate[], _config: BundleConfig): string {
  return scored.map((item) => JSON.stringify(item)).join("\n");
}

/**
 * Create a markdown bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (unused)
 * @returns Markdown string bundle
 */
export function createMarkdownBundle(scored: ScoredCandidate[], _config: BundleConfig): string {
  const header = `# Lore Forge Bundle\n\nGenerated: ${new Date().toISOString()}\n\n`;
  const items = scored
    .map((item, index) => {
      const i = item as unknown as Record<string, unknown>;
      const scoreStr = JSON.stringify(i.score ?? "");
      const reasonStr = i.reason ? JSON.stringify(i.reason) : "";
      const content = JSON.stringify((i.candidate as Record<string, unknown>).content ?? "");
      return `## Candidate ${index + 1}\n\n**Score:** ${scoreStr}\n\n${
        reasonStr ? `**Reason:** ${reasonStr}\n\n` : ""
      }${content}`;
    })
    .join("\n\n---\n\n");
  return header + items;
}

// Library-only: No runtime hooks, no behavior change
