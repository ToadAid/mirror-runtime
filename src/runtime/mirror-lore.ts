import fs from "node:fs/promises";
import path from "node:path";

export type MirrorLoreScroll = {
  path: string;
  filename: string;
  title: string;
  body: string;
};

export type MirrorLoreExcerpt = {
  path: string;
  filename: string;
  title: string;
  snippet: string;
  score: number;
};

export type MirrorLoreRetrievalDiagnostics = {
  candidateCount: number;
  selected: MirrorLoreExcerpt[];
};

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const tokens = Array.from(
    new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 1)),
  );
  return tokens.filter((token) => !STOPWORDS.has(token));
}

function resolveTitle(filename: string, body: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading && heading.length > 0 ? heading : path.basename(filename, path.extname(filename));
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return await collectMarkdownFiles(entryPath);
      }
      if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        return [entryPath];
      }
      return [];
    }),
  );
  return files.flat().toSorted();
}

function countTokenHits(haystack: string, tokens: string[]): number {
  return tokens.reduce((score, token) => {
    if (!haystack.includes(token)) {
      return score;
    }
    return score + 1;
  }, 0);
}

function buildSnippet(body: string, tokens: string[], maxChars = 280): string {
  const compact = collapseWhitespace(body);
  if (compact.length <= maxChars) {
    return compact;
  }

  const lower = compact.toLowerCase();
  const matchIndex = tokens.map((token) => lower.indexOf(token)).find((index) => index >= 0);
  if (matchIndex === undefined) {
    return `${compact.slice(0, maxChars - 1).trimEnd()}...`;
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(compact.length, start + maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compact.length ? "..." : "";
  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

export async function loadMirrorLoreScrolls(loreDir?: string): Promise<MirrorLoreScroll[]> {
  const resolvedLoreDir = loreDir?.trim();
  if (!resolvedLoreDir) {
    return [];
  }

  try {
    const files = await collectMarkdownFiles(resolvedLoreDir);
    const scrolls = await Promise.all(
      files.map(async (filePath) => {
        const body = await fs.readFile(filePath, "utf-8");
        return {
          path: filePath,
          filename: path.basename(filePath),
          title: resolveTitle(filePath, body),
          body,
        } satisfies MirrorLoreScroll;
      }),
    );
    return scrolls;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function scoreRelevantMirrorLore(params: {
  scrolls: MirrorLoreScroll[];
  query: string;
}): MirrorLoreExcerpt[] {
  const tokens = tokenize(params.query);
  if (tokens.length === 0) {
    return [];
  }

  return params.scrolls
    .map((scroll) => {
      const filename = scroll.filename.toLowerCase();
      const title = scroll.title.toLowerCase();
      const body = scroll.body.toLowerCase();
      const score =
        countTokenHits(filename, tokens) * 6 +
        countTokenHits(title, tokens) * 5 +
        countTokenHits(body, tokens) * 2;
      if (score === 0) {
        return null;
      }
      return {
        path: scroll.path,
        filename: scroll.filename,
        title: scroll.title,
        snippet: buildSnippet(scroll.body, tokens),
        score,
      } satisfies MirrorLoreExcerpt;
    })
    .filter((entry): entry is MirrorLoreExcerpt => entry !== null)
    .toSorted((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

export function retrieveRelevantMirrorLoreWithDiagnostics(params: {
  scrolls: MirrorLoreScroll[];
  query: string;
  limit?: number;
}): MirrorLoreRetrievalDiagnostics {
  const ranked = scoreRelevantMirrorLore(params);
  return {
    candidateCount: ranked.length,
    selected: ranked.slice(0, params.limit ?? 3),
  };
}

export function retrieveRelevantMirrorLore(params: {
  scrolls: MirrorLoreScroll[];
  query: string;
  limit?: number;
}): MirrorLoreExcerpt[] {
  return retrieveRelevantMirrorLoreWithDiagnostics(params).selected;
}
