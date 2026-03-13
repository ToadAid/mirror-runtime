import fs from "node:fs/promises";
import path from "node:path";
import type { MirrorSymbolResonance, ReflectCanonInput } from "./reflection_types.js";

export async function analyzeSymbolResonance(
  input: ReflectCanonInput,
): Promise<MirrorSymbolResonance> {
  const symbolMap = new Map<
    string,
    {
      count: number;
      related_scrolls: Set<string>;
      concepts: string[];
    }
  >();

  for (const matched of input.matchedSymbols) {
    symbolMap.set(matched.symbol, {
      count: 0,
      related_scrolls: new Set<string>(),
      concepts: matched.concepts,
    });
  }

  for (const candidate of input.candidates) {
    const raw = await fs.readFile(path.join(input.loreDir, candidate.path), "utf8");
    for (const matched of input.matchedSymbols) {
      if (!raw.includes(matched.symbol)) {
        continue;
      }
      const entry = symbolMap.get(matched.symbol);
      if (!entry) {
        continue;
      }
      entry.count += 1;
      entry.related_scrolls.add(candidate.path);
    }
  }

  const symbols = [...symbolMap.entries()]
    .map(([symbol, entry]) => ({
      symbol,
      count: entry.count,
      related_scrolls: [...entry.related_scrolls],
      concepts: entry.concepts,
    }))
    .filter((entry) => entry.count > 0)
    .toSorted((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));

  const hints = symbols.map(
    (entry) =>
      `${entry.symbol} resonates across ${entry.count} retrieved scroll(s): ${entry.concepts.join(", ")}`,
  );

  return {
    symbols,
    hints,
  };
}
