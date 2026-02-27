/**
 * @fileoverview Lore Forge Bundle Exports
 * @description Provides bundle generation utilities for lore candidates.
 */

/**
 * Create a JSON bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param config - Bundle configuration
 * @returns JSON string bundle
 */
/* eslint-disable no-explicit-any */
export function createJsonBundle(
  scored: any[],
  config: { format: string; outputPath: string }
): string {
  return JSON.stringify(scored, null, 2);
}

/**
 * Create a JSONL bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param config - Bundle configuration
 * @returns JSONL string bundle
 */
export function createJsonlBundle(
  scored: any[],
  config: { format: string; outputPath: string }
): string {
  return scored.map((item) => JSON.stringify(item)).join('\n');
}

/**
 * Create a markdown bundle from scored candidates
 * @param scored - Array of scored candidates
 * @param config - Bundle configuration
 * @returns Markdown string bundle
 */
export function createMarkdownBundle(
  scored: any[],
  config: { format: string; outputPath: string }
): string {
  const header = `# Lore Forge Bundle\n\nGenerated: ${new Date().toISOString()}\n\n`;
  const items = scored
    .map(
      (item, index) =>
        `## Candidate ${index + 1}\n\n**Score:** ${item.score}\n\n${
          item.reason ? `**Reason:** ${item.reason}\n\n` : ''
        }${item.candidate.content}`
    )
    .join('\n\n---\n\n');
  return header + items;
}
/* eslint-enable no-explicit-any */

// Library-only: No runtime hooks, no behavior change