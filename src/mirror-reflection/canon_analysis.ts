import fs from "node:fs/promises";
import path from "node:path";
import type {
  MirrorCanonReflection,
  MirrorCanonTheme,
  MirrorPotentialConflict,
  MirrorScrollCluster,
  ReflectCanonInput,
} from "./reflection_types.js";

const WORD_PATTERN = /[a-z0-9$]+/g;

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(WORD_PATTERN)
      ?.filter((token) => token.length >= 3) ?? []
  );
}

function stopWords(): Set<string> {
  return new Set([
    "toby",
    "what",
    "when",
    "with",
    "from",
    "that",
    "this",
    "have",
    "about",
    "into",
    "through",
    "rune",
    "scroll",
    "question",
  ]);
}

async function extractThemes(input: ReflectCanonInput): Promise<MirrorCanonTheme[]> {
  const counts = new Map<string, { score: number; scrolls: Set<string> }>();
  const blocked = stopWords();

  for (const candidate of input.candidates) {
    const raw = await fs.readFile(path.join(input.loreDir, candidate.path), "utf8");
    const tokens = new Set(tokenize(`${candidate.title} ${raw}`));
    for (const token of tokens) {
      if (blocked.has(token)) {
        continue;
      }
      const entry = counts.get(token) ?? { score: 0, scrolls: new Set<string>() };
      entry.score += 1;
      entry.scrolls.add(candidate.path);
      counts.set(token, entry);
    }
  }

  return [...counts.entries()]
    .map(([theme, data]) => ({
      theme,
      score: data.score,
      supporting_scrolls: [...data.scrolls],
    }))
    .toSorted((a, b) => b.score - a.score || a.theme.localeCompare(b.theme))
    .slice(0, 5);
}

function buildClusters(input: ReflectCanonInput): MirrorScrollCluster[] {
  const byFamily = new Map<string, string[]>();
  for (const candidate of input.candidates) {
    const family = /^TOBY_([A-Z]+)\d+/.exec(candidate.scroll_id)?.[1] ?? "UNKNOWN";
    const existing = byFamily.get(family) ?? [];
    existing.push(candidate.path);
    byFamily.set(family, existing);
  }

  return [...byFamily.entries()].map(([label, scrolls]) => ({
    label: `family:${label}`,
    scrolls,
  }));
}

function buildPotentialConflicts(input: ReflectCanonInput): MirrorPotentialConflict[] {
  const conflicts: MirrorPotentialConflict[] = [];

  const superseded = input.candidates.filter((candidate) => candidate.canon_notes.length > 0);
  for (const candidate of superseded) {
    conflicts.push({
      type: "supersession",
      message: candidate.canon_notes[0] ?? "Supersession note detected.",
      related_scrolls: [candidate.path],
    });
  }

  if (input.candidates.length > 1) {
    const top = input.candidates[0];
    const second = input.candidates[1];
    if (top && second && Math.abs(top.score - second.score) <= 6) {
      conflicts.push({
        type: "candidate_overlap",
        message: "Multiple nearby canonical scrolls may address overlapping aspects of the query.",
        related_scrolls: [top.path, second.path],
      });
    }
  }

  return conflicts;
}

export async function analyzeCanonContext(
  input: ReflectCanonInput,
): Promise<MirrorCanonReflection> {
  return {
    themes: await extractThemes(input),
    symbolic_resonance: {
      symbols: [],
      hints: [],
    },
    scroll_clusters: buildClusters(input),
    potential_conflicts: buildPotentialConflicts(input),
  };
}
