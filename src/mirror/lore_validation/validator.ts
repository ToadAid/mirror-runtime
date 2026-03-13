import fs from "node:fs/promises";
import path from "node:path";
import { loadSymbolRegistry } from "../lore_retrieval/symbol_registry.js";
import type { MirrorLoreDiscoveredFile } from "../lore_sources/types.js";

const TARGET_FILENAME_PATTERN = /^TOBY_(L|QA|C|T)[0-9]+_.+\.md$/;
const FRONTMATTER_BOUNDARY = "---";

export type MirrorLoreValidationWarningCode =
  | "filename_pattern"
  | "frontmatter_missing"
  | "frontmatter_field_missing"
  | "symbol_unknown"
  | "anchor_missing"
  | "supersedes_missing";

export type MirrorLoreValidationWarning = {
  path: string;
  code: MirrorLoreValidationWarningCode;
  message: string;
};

export type MirrorLoreValidationReport = {
  loreDir: string;
  checkedFiles: number;
  warningCount: number;
  warnings: MirrorLoreValidationWarning[];
};

let lastLoreValidationReport: MirrorLoreValidationReport | null = null;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function parseFrontmatter(raw: string): Record<string, string> | null {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_BOUNDARY) {
    return null;
  }

  const fields: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === FRONTMATTER_BOUNDARY) {
      return fields;
    }

    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const key = normalizeText(match[1] ?? "");
    const value = (match[2] ?? "").trim();
    fields[key] = value;
  }

  return null;
}

function parseSymbols(raw: string): string[] {
  const cleaned = raw.replace(/[[\],]/g, " ");
  return cleaned
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseAnchorReference(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

function shouldEmitWarnings(): boolean {
  return process.env.VITEST !== "true";
}

async function collectKnownLoreEntries(loreDir: string): Promise<MirrorLoreDiscoveredFile[]> {
  const discovered: MirrorLoreDiscoveredFile[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_index") {
          continue;
        }
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }
      discovered.push({
        path: path.relative(loreDir, absolutePath).split(path.sep).join("/"),
        kind: "canonical",
      });
    }
  }

  await walk(loreDir);
  discovered.sort((a, b) => a.path.localeCompare(b.path));
  return discovered;
}

export function getLastLoreValidationReport(): MirrorLoreValidationReport | null {
  return lastLoreValidationReport;
}

export async function validateLoreCorpus(
  loreDir: string,
  files: MirrorLoreDiscoveredFile[],
): Promise<MirrorLoreValidationReport> {
  const warnings: MirrorLoreValidationWarning[] = [];
  const symbolRegistry = await loadSymbolRegistry();
  const knownSymbols = new Set(symbolRegistry.map((entry) => entry.symbol));
  const supersedesPath = path.join(loreDir, "_index", "SUPERSEDES.json");
  let supersedesKeys = new Set<string>();

  try {
    const supersedesRaw = await fs.readFile(supersedesPath, "utf8");
    supersedesKeys = new Set(Object.keys(JSON.parse(supersedesRaw) as Record<string, unknown>));
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code !== "ENOENT") {
      throw error;
    }
  }

  const knownPaths = new Set(files.map((file) => file.path));
  const knownIds = new Set(
    files
      .map((file) => /^([A-Z0-9_]+)\b/.exec(path.basename(file.path))?.[1] ?? "")
      .filter(Boolean),
  );

  for (const file of files) {
    if (!TARGET_FILENAME_PATTERN.test(path.basename(file.path))) {
      warnings.push({
        path: file.path,
        code: "filename_pattern",
        message: "filename does not match target pattern TOBY_(L|QA|C|T)[0-9]+_*.md",
      });
    }

    const absolutePath = path.join(loreDir, file.path);
    const raw = await fs.readFile(absolutePath, "utf8");
    const frontmatter = parseFrontmatter(raw);
    if (!frontmatter) {
      warnings.push({
        path: file.path,
        code: "frontmatter_missing",
        message: "frontmatter block is missing",
      });
      continue;
    }

    const requiredFields = [
      { keys: ["title"], label: "title" },
      { keys: ["epoch"], label: "epoch" },
      { keys: ["symbols"], label: "symbols" },
      { keys: ["sacred_numbers", "sacred numbers"], label: "sacred numbers" },
      { keys: ["sha256_seed", "sha-256 seed", "sha256"], label: "sha256 seed" },
    ];

    for (const field of requiredFields) {
      const found = field.keys.some((key) => {
        const value = frontmatter[key];
        return typeof value === "string" && value.trim().length > 0;
      });
      if (!found) {
        warnings.push({
          path: file.path,
          code: "frontmatter_field_missing",
          message: `frontmatter missing required field: ${field.label}`,
        });
      }
    }

    const rawSymbols = frontmatter.symbols;
    if (rawSymbols) {
      for (const symbol of parseSymbols(rawSymbols)) {
        if (!knownSymbols.has(symbol)) {
          warnings.push({
            path: file.path,
            code: "symbol_unknown",
            message: `symbol not found in SYMBOL_REGISTRY.md: ${symbol}`,
          });
        }
      }
    }

    for (const anchorKey of ["prev", "previous", "previous_scroll", "next", "next_scroll"]) {
      const anchorRef = frontmatter[anchorKey];
      if (!anchorRef) {
        continue;
      }
      const target = parseAnchorReference(anchorRef);
      if (!knownPaths.has(target) && !knownIds.has(target)) {
        warnings.push({
          path: file.path,
          code: "anchor_missing",
          message: `${anchorKey} reference does not exist in lore corpus: ${target}`,
        });
      }
    }

    const supersedesRef = frontmatter.supersedes ?? frontmatter.updated_from;
    if (supersedesRef) {
      const targets = parseSymbols(supersedesRef);
      for (const target of targets) {
        if (!supersedesKeys.has(target)) {
          warnings.push({
            path: file.path,
            code: "supersedes_missing",
            message: `supersedes reference not found in SUPERSEDES.json: ${target}`,
          });
        }
      }
    }
  }

  const report = {
    loreDir,
    checkedFiles: files.length,
    warningCount: warnings.length,
    warnings,
  };
  lastLoreValidationReport = report;

  if (warnings.length > 0 && shouldEmitWarnings()) {
    console.warn(
      `[mirror.lore_validation] ${warnings.length} warning(s) across ${files.length} file(s)`,
    );
  }

  return report;
}

export async function validateLoreDraftInCorpusContext(params: {
  loreDir: string;
  draftPath: string;
  draftContent: string;
}): Promise<MirrorLoreValidationReport> {
  const existingFiles = await collectKnownLoreEntries(params.loreDir);
  const files = [
    ...existingFiles.filter((file) => file.path !== params.draftPath),
    { path: params.draftPath, kind: "canonical" as const },
  ];
  const warnings: MirrorLoreValidationWarning[] = [];
  const symbolRegistry = await loadSymbolRegistry();
  const knownSymbols = new Set(symbolRegistry.map((entry) => entry.symbol));
  const supersedesPath = path.join(params.loreDir, "_index", "SUPERSEDES.json");
  let supersedesKeys = new Set<string>();

  try {
    const supersedesRaw = await fs.readFile(supersedesPath, "utf8");
    supersedesKeys = new Set(Object.keys(JSON.parse(supersedesRaw) as Record<string, unknown>));
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code !== "ENOENT") {
      throw error;
    }
  }

  const knownPaths = new Set(files.map((file) => file.path));
  const knownIds = new Set(
    files
      .map((file) => /^([A-Z0-9_]+)\b/.exec(path.basename(file.path))?.[1] ?? "")
      .filter(Boolean),
  );

  const raw = params.draftContent;
  if (!TARGET_FILENAME_PATTERN.test(path.basename(params.draftPath))) {
    warnings.push({
      path: params.draftPath,
      code: "filename_pattern",
      message: "filename does not match target pattern TOBY_(L|QA|C|T)[0-9]+_*.md",
    });
  }

  const frontmatter = parseFrontmatter(raw);
  if (!frontmatter) {
    warnings.push({
      path: params.draftPath,
      code: "frontmatter_missing",
      message: "frontmatter block is missing",
    });
  } else {
    const requiredFields = [
      { keys: ["title"], label: "title" },
      { keys: ["epoch"], label: "epoch" },
      { keys: ["symbols"], label: "symbols" },
      { keys: ["sacred_numbers", "sacred numbers"], label: "sacred numbers" },
      { keys: ["sha256_seed", "sha-256 seed", "sha256"], label: "sha256 seed" },
    ];

    for (const field of requiredFields) {
      const found = field.keys.some((key) => {
        const value = frontmatter[key];
        return typeof value === "string" && value.trim().length > 0;
      });
      if (!found) {
        warnings.push({
          path: params.draftPath,
          code: "frontmatter_field_missing",
          message: `frontmatter missing required field: ${field.label}`,
        });
      }
    }

    const rawSymbols = frontmatter.symbols;
    if (rawSymbols) {
      for (const symbol of parseSymbols(rawSymbols)) {
        if (!knownSymbols.has(symbol)) {
          warnings.push({
            path: params.draftPath,
            code: "symbol_unknown",
            message: `symbol not found in SYMBOL_REGISTRY.md: ${symbol}`,
          });
        }
      }
    }

    for (const anchorKey of ["prev", "previous", "previous_scroll", "next", "next_scroll"]) {
      const anchorRef = frontmatter[anchorKey];
      if (!anchorRef) {
        continue;
      }
      const target = parseAnchorReference(anchorRef);
      if (!knownPaths.has(target) && !knownIds.has(target)) {
        warnings.push({
          path: params.draftPath,
          code: "anchor_missing",
          message: `${anchorKey} reference does not exist in lore corpus: ${target}`,
        });
      }
    }

    const supersedesRef = frontmatter.supersedes ?? frontmatter.updated_from;
    if (supersedesRef) {
      const targets = parseSymbols(supersedesRef);
      for (const target of targets) {
        if (!supersedesKeys.has(target)) {
          warnings.push({
            path: params.draftPath,
            code: "supersedes_missing",
            message: `supersedes reference not found in SUPERSEDES.json: ${target}`,
          });
        }
      }
    }
  }

  return {
    loreDir: params.loreDir,
    checkedFiles: 1,
    warningCount: warnings.length,
    warnings,
  };
}
