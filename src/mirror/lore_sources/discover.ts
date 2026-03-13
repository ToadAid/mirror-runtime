import fs from "node:fs/promises";
import path from "node:path";
import { validateLoreCorpus } from "../lore_validation/index.js";
import { ensureScrollIndexUpToDate } from "./scroll_index.js";
import type { MirrorLoreDiscoveredFile, MirrorLorePolicy, MirrorLoreSourceKind } from "./types.js";

async function discoverMarkdownFiles(
  sourceDir: string,
  kind: MirrorLoreSourceKind,
): Promise<MirrorLoreDiscoveredFile[]> {
  const discovered: MirrorLoreDiscoveredFile[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      const maybeErr = error as NodeJS.ErrnoException;
      if (maybeErr?.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      const rel = path.relative(sourceDir, absolutePath).split(path.sep).join("/");
      discovered.push({ path: rel, kind });
    }
  }

  await walk(sourceDir);
  discovered.sort((a, b) => a.path.localeCompare(b.path));
  return discovered;
}

export async function discoverLoreFiles(
  policy: MirrorLorePolicy,
): Promise<MirrorLoreDiscoveredFile[]> {
  await ensureScrollIndexUpToDate(policy.canonicalDir);
  const canonical = await discoverMarkdownFiles(policy.canonicalDir, "canonical");
  await validateLoreCorpus(policy.canonicalDir, canonical);
  if (!policy.includeLocal) {
    return canonical;
  }

  const local = await discoverMarkdownFiles(policy.localDir, "local");
  return [...canonical, ...local];
}
