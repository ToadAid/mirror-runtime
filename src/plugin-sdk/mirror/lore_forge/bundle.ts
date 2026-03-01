/**
 * @fileoverview Lore Forge Bundle Exports
 * @description Provides bundle generation utilities for lore candidates.
 */

import type { BundleConfig } from "./types.js";

/**
 * Create a JSON bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (reserved for future)
 * @returns JSON string bundle
 */
export function createJsonBundle(scored: unknown[], _config: BundleConfig): string {
  return JSON.stringify(scored, null, 2);
}

/**
 * Create a JSONL bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (reserved for future)
 * @returns JSONL string bundle
 */
export function createJsonlBundle(scored: unknown[], _config: BundleConfig): string {
  return scored.map((item) => JSON.stringify(item)).join("\n");
}

/**
 * Create a markdown bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param _config - Bundle configuration (reserved for future)
 * @returns Markdown string bundle
 */
export function createMarkdownBundle(scored: unknown[], _config: BundleConfig): string {
  const header = # Lore Forge Bundle\n\nGenerated: ${new Date().toISOString()}\n\n;

  const items = scored
    .map((item: unknown, index) => {
      const scoredItem = item as {
        score?: number;
        reason?: string;
        candidate?: { content?: string };
      };

      const scoreLine = typeof scoredItem.score === "number" ? **Score:** ${scoredItem.score}\n\n : "";
      const reasonLine = scoredItem.reason ? **Reason:** ${scoredItem.reason}\n\n : "";
      const content = scoredItem.candidate?.content ?? "";

      return ## Candidate ${index + 1}\n\n${scoreLine}${reasonLine}${content};
    })
    .join("\n\n---\n\n");

  return header + items;
}

// Library-only: No runtime hooks, no behavior change