import fs from "node:fs/promises";
import path from "node:path";

const SCROLL_FILE_PATTERN = /^TOBY_[^_]+(?:_.+)?\.md$/;
const SCROLL_ID_PATTERN = /^(TOBY_[^_]+)(?:_(.+))?\.md$/;

export type MirrorScrollIndexEntry = {
  scroll_id: string;
  title: string;
  path: string;
  keywords: string[];
};

export type MirrorScrollIndexEnsureResult = {
  rebuilt: boolean;
  reason: "missing" | "stale" | "fresh" | "no_scrolls" | "missing_dir";
  scrollCount: number;
  indexPath: string;
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function splitKeywords(title: string): string[] {
  const normalized = title.replaceAll("-", "_");
  const camelSplit = normalized.replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2");
  const parts = camelSplit.split(/[_\s]+/);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const part of parts) {
    const word = part.trim().toLowerCase();
    if (!word || seen.has(word)) {
      continue;
    }
    seen.add(word);
    keywords.push(word);
  }

  return keywords;
}

async function collectScrollFiles(loreDir: string): Promise<string[]> {
  const discovered: string[] = [];

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

      if (!entry.isFile() || !SCROLL_FILE_PATTERN.test(entry.name)) {
        continue;
      }

      discovered.push(absolutePath);
    }
  }

  await walk(loreDir);
  discovered.sort((a, b) => a.localeCompare(b));
  return discovered;
}

function buildIndexEntries(loreDir: string, absolutePaths: string[]): MirrorScrollIndexEntry[] {
  return absolutePaths.map((absolutePath) => {
    const fileName = path.basename(absolutePath);
    const match = fileName.match(SCROLL_ID_PATTERN);
    const scrollId = match?.[1] ?? path.parse(fileName).name;
    const title = match?.[2] ?? "";

    return {
      scroll_id: scrollId,
      title,
      path: toPosixPath(path.relative(loreDir, absolutePath)),
      keywords: splitKeywords(title),
    };
  });
}

async function writeScrollIndex(
  indexPath: string,
  entries: MirrorScrollIndexEntry[],
): Promise<void> {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function newestScrollMtimeMs(absolutePaths: string[]): Promise<number> {
  let newest = 0;
  for (const absolutePath of absolutePaths) {
    const stat = await fs.stat(absolutePath);
    newest = Math.max(newest, stat.mtimeMs);
  }
  return newest;
}

export async function ensureScrollIndexUpToDate(
  loreDir: string,
): Promise<MirrorScrollIndexEnsureResult> {
  const resolvedLoreDir = path.resolve(loreDir);
  const indexPath = path.join(resolvedLoreDir, "_index", "scroll_index.json");

  try {
    const dirStat = await fs.stat(resolvedLoreDir);
    if (!dirStat.isDirectory()) {
      return { rebuilt: false, reason: "missing_dir", scrollCount: 0, indexPath };
    }
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code === "ENOENT") {
      return { rebuilt: false, reason: "missing_dir", scrollCount: 0, indexPath };
    }
    throw error;
  }

  const absolutePaths = await collectScrollFiles(resolvedLoreDir);
  if (absolutePaths.length === 0) {
    return { rebuilt: false, reason: "no_scrolls", scrollCount: 0, indexPath };
  }

  let indexStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    indexStat = await fs.stat(indexPath);
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code !== "ENOENT") {
      throw error;
    }
  }

  const newestMtime = await newestScrollMtimeMs(absolutePaths);
  const stale = !indexStat || newestMtime > indexStat.mtimeMs;

  if (!stale) {
    return {
      rebuilt: false,
      reason: "fresh",
      scrollCount: absolutePaths.length,
      indexPath,
    };
  }

  const entries = buildIndexEntries(resolvedLoreDir, absolutePaths);
  await writeScrollIndex(indexPath, entries);
  return {
    rebuilt: true,
    reason: indexStat ? "stale" : "missing",
    scrollCount: entries.length,
    indexPath,
  };
}
