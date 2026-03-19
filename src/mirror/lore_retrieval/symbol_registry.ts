import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type MirrorSymbolRegistryEntry = {
  symbol: string;
  label: string;
  concepts: string[];
};

function resolveSymbolRegistryPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIRROR_SYMBOL_REGISTRY_PATH
      ? path.resolve(process.env.MIRROR_SYMBOL_REGISTRY_PATH)
      : null,
    path.resolve(process.cwd(), "docs/lore/SYMBOL_REGISTRY.md"),
    path.resolve(currentDir, "../share/lore/SYMBOL_REGISTRY.md"),
    path.resolve(currentDir, "../docs/lore/SYMBOL_REGISTRY.md"),
    path.resolve(currentDir, "../../../docs/lore/SYMBOL_REGISTRY.md"),
  ].filter((candidate): candidate is string => typeof candidate === "string");

  const resolved = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!resolved) {
    throw new Error("Unable to resolve SYMBOL_REGISTRY.md");
  }
  return resolved;
}

function splitConcepts(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export async function loadSymbolRegistry(): Promise<MirrorSymbolRegistryEntry[]> {
  const raw = await fs.readFile(resolveSymbolRegistryPath(), "utf8");
  const lines = raw.split(/\r?\n/);
  const entries: MirrorSymbolRegistryEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const headingMatch = /^##\s+(\S+)\s+(.+)$/.exec(line);
    if (!headingMatch) {
      continue;
    }

    const symbol = headingMatch[1] ?? "";
    const label = (headingMatch[2] ?? "").trim();
    if (!symbol || label === "Symbol Usage Rules" || label === "Common Usage Guidance") {
      continue;
    }

    let meaning = "";
    let aliases = "";
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor]?.trim() ?? "";
      const next = lines[cursor + 1]?.trim() ?? "";

      if (current.startsWith("## ")) {
        break;
      }
      if (current === "Meaning:") {
        meaning = next;
      }
      if (current === "Related concepts / aliases:") {
        aliases = next;
      }
    }

    const concepts = Array.from(new Set([...splitConcepts(meaning), ...splitConcepts(aliases)]));
    entries.push({ symbol, label, concepts });
  }

  return entries;
}
