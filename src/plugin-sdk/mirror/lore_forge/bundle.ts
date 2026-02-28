/**
 * @fileoverview Lore Forge Bundle Exports
 * @description Provides bundle generation utilities for lore candidates.
 */

import type { BundleConfig } from "./types.js";

/**
 * Create a JSON bundle from scored candidates
 * @param _scored - Array of scored candidates
 * @param config - Bundle configuration
 * @returns JSON string bundle
 */
export function createJsonBundle(_scored: unknown[], _config: BundleConfig): string {
  return JSON.stringify(_scored, null, 2);
}

/**
 * Create a JSONL bundle from scored candidates
 * @param _scored - Array of scored candidates
 * @param _config - Bundle configuration
 * @returns JSONL string bundle
 */
export function createJsonlBundle(_scored: unknown[], _config: BundleConfig): string {
  return _scored.map((item) => JSON.stringify(item)).join("\n");
}

/**
 * Create a markdown bundle from scored candidates
 * @param _scored - Array of scored candidates
 * @param _config - Bundle configuration
 * @returns Markdown string bundle
 */
export function createMarkdownBundle(_scored: unknown[], _config: BundleConfig): string {
  const header = `# Lore Forge Bundle\n\nGenerated: ${new Date().toISOString()}\n\n`;
  const items = _scored
    .map((item: unknown, index) => {
      const scoredItem = item as { score: number; reason?: string; candidate: { content: string } };
      return `## Candidate ${index + 1}\n\n**Score:** ${scoredItem.score}\n\n${
        scoredItem.reason ? `**Reason:** ${scoredItem.reason}\n\n` : ""
      }${scoredItem.candidate.content}`;
    })
    .join("\n\n---\n\n");
  return header + items;
}

// Library-only: No runtime hooks, no behavior change
