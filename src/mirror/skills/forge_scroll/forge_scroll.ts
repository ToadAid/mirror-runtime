import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSymbolRegistry } from "../../lore_retrieval/symbol_registry.js";
import {
  validateLoreCorpus,
  type MirrorLoreValidationReport,
} from "../../lore_validation/index.js";

export type ForgeScrollCategory = "L" | "QA" | "C";

export type ForgeScrollInput = {
  title: string;
  category: ForgeScrollCategory;
  narrative: string;
  symbols?: string[];
  anchors?: {
    prev?: string;
    next?: string;
  };
};

export type ForgeScrollResult = {
  filename: string;
  frontmatter: string;
  scroll_template: string;
  suggested_symbols: string[];
  validation: MirrorLoreValidationReport;
};

function slugifyTitle(value: string): string {
  const words = value
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return words.length > 0 ? words.join("_") : "Untitled";
}

function titleToHeading(value: string): string {
  return value.trim();
}

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9$]+/g)
      ?.filter(Boolean) ?? []
  );
}

function suggestSacredNumbers(value: string): number[] {
  const numbers = Array.from(
    new Set((value.match(/\b\d+\b/g) ?? []).map((part) => Number.parseInt(part, 10))),
  );
  return numbers;
}

function buildBody(category: ForgeScrollCategory, narrative: string): string {
  if (category === "QA") {
    return [
      "## Question",
      "",
      "[Author fills in the exact traveler question]",
      "",
      "## Answer",
      "",
      narrative.trim(),
      "",
      "## Supporting Canon Notes",
      "",
      "[Reference relevant canon here]",
      "",
      "## Cryptic Symbol Table",
      "",
      "[List symbols and meanings aligned with SYMBOL_REGISTRY.md]",
      "",
      "## Reference Scrolls",
      "",
      "[Add related scroll ids here]",
    ].join("\n");
  }

  if (category === "C") {
    return [
      "## Covenant or Commentary",
      "",
      narrative.trim(),
      "",
      "## Interpretation",
      "",
      "[Explain the covenant or commentary meaning here]",
      "",
      "## Cryptic Symbol Table",
      "",
      "[List symbols and meanings aligned with SYMBOL_REGISTRY.md]",
      "",
      "## Reference Scrolls",
      "",
      "[Add related scroll ids here]",
    ].join("\n");
  }

  return [
    "## Opening Thesis",
    "",
    narrative.trim(),
    "",
    "## Body Narrative",
    "",
    "[Extend the canonical narrative here]",
    "",
    "## Cryptic Symbol Table",
    "",
    "[List symbols and meanings aligned with SYMBOL_REGISTRY.md]",
    "",
    "## Reference Scrolls",
    "",
    "[Add related scroll ids here]",
    "",
    "## Closing Note",
    "",
    "[Optional covenant line]",
  ].join("\n");
}

function buildFrontmatter(params: {
  scrollId: string;
  title: string;
  category: ForgeScrollCategory;
  narrative: string;
  symbols: string[];
  anchors?: ForgeScrollInput["anchors"];
}): string {
  const sacredNumbers = suggestSacredNumbers(`${params.title} ${params.narrative}`);
  const lines = [
    "---",
    `title: ${params.title}`,
    "epoch: TBD",
    `symbols: ${params.symbols.length > 0 ? `[${params.symbols.join(", ")}]` : "[]"}`,
    `sacred_numbers: ${sacredNumbers.length > 0 ? `[${sacredNumbers.join(", ")}]` : "[]"}`,
    "sha256_seed: TBD",
  ];
  if (params.anchors?.prev) {
    lines.push(`prev: ${params.anchors.prev}`);
  }
  if (params.anchors?.next) {
    lines.push(`next: ${params.anchors.next}`);
  }
  lines.push("---");
  return lines.join("\n");
}

async function suggestSymbols(
  title: string,
  narrative: string,
  requestedSymbols: string[] = [],
): Promise<string[]> {
  const registry = await loadSymbolRegistry();
  const textTokens = new Set(tokenize(`${title} ${narrative}`));
  const suggested = new Set<string>(requestedSymbols);

  for (const entry of registry) {
    if (
      entry.concepts.some((concept) => tokenize(concept).some((token) => textTokens.has(token)))
    ) {
      suggested.add(entry.symbol);
    }
  }

  return [...suggested];
}

async function validateGeneratedScroll(
  filename: string,
  content: string,
): Promise<MirrorLoreValidationReport> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-forge-scroll-"));
  try {
    await fs.mkdir(path.join(tempDir, "_index"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "_index", "SUPERSEDES.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(tempDir, filename), content, "utf8");
    return await validateLoreCorpus(tempDir, [{ path: filename, kind: "canonical" }]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function forgeScroll(input: ForgeScrollInput): Promise<ForgeScrollResult> {
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new TypeError("forge-scroll requires title");
  }
  if (!["L", "QA", "C"].includes(input.category)) {
    throw new TypeError("forge-scroll category must be one of L, QA, C");
  }
  if (typeof input.narrative !== "string" || input.narrative.trim().length === 0) {
    throw new TypeError("forge-scroll requires narrative");
  }

  const scrollId = `TOBY_${input.category}0000`;
  const filename = `${scrollId}_${slugifyTitle(input.title)}.md`;
  const suggestedSymbols = await suggestSymbols(input.title, input.narrative, input.symbols ?? []);
  const frontmatter = buildFrontmatter({
    scrollId,
    title: input.title.trim(),
    category: input.category,
    narrative: input.narrative,
    symbols: suggestedSymbols,
    anchors: input.anchors,
  });
  const body = [
    frontmatter,
    "",
    `# ${titleToHeading(input.title)}`,
    "",
    buildBody(input.category, input.narrative),
    "",
  ].join("\n");
  const validation = await validateGeneratedScroll(filename, body);

  return {
    filename,
    frontmatter,
    scroll_template: body,
    suggested_symbols: suggestedSymbols,
    validation,
  };
}
