import { loadSymbolRegistry } from "../mirror/lore_retrieval/index.js";
import { MIRROR_REVIEW_RULES } from "./review_rules.js";
import type { MirrorSymbolValidation } from "./review_types.js";

function parseFrontmatterSymbols(raw: string): string[] {
  const match = /^---[\s\S]*?^symbols:\s*(.+)$[\s\S]*?^---/m.exec(raw);
  const value = match?.[1] ?? "";
  return value
    .replace(/[[\],]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function countOccurrences(raw: string, symbol: string): number {
  return raw.split(symbol).length - 1;
}

export async function validateDraftSymbols(draftContent: string): Promise<MirrorSymbolValidation> {
  const registry = await loadSymbolRegistry();
  const known = new Map(registry.map((entry) => [entry.symbol, entry]));
  const symbols = parseFrontmatterSymbols(draftContent);
  const unknown_symbols = symbols.filter((symbol) => !known.has(symbol));
  const overused_symbols = symbols.filter(
    (symbol) =>
      countOccurrences(draftContent, symbol) > MIRROR_REVIEW_RULES.overusedSymbolThreshold,
  );
  const normalized = draftContent.toLowerCase();
  const mismatched_symbols = symbols
    .filter((symbol) => known.has(symbol))
    .map((symbol) => {
      const entry = known.get(symbol);
      if (!entry) {
        return null;
      }
      const conceptMatch = entry.concepts.some((concept) =>
        normalized.includes(concept.toLowerCase()),
      );
      if (conceptMatch) {
        return null;
      }
      return {
        symbol,
        message: `${symbol} is declared but its registry concepts are not reflected in the draft text.`,
      };
    })
    .filter((value): value is { symbol: string; message: string } => value !== null);

  return {
    unknown_symbols,
    overused_symbols: Array.from(new Set(overused_symbols)),
    mismatched_symbols,
  };
}
