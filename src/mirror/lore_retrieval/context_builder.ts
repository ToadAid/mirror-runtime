import fs from "node:fs/promises";
import path from "node:path";
import type { MirrorLoreRetrievalCandidate, MirrorMemoryContext } from "./types.js";

const WORD_PATTERN = /[a-z0-9$]+/g;

export type BuildLoreContextOptions = {
  loreDir: string;
  query: string;
  candidates: MirrorLoreRetrievalCandidate[];
  memory?: MirrorMemoryContext;
  maxScrolls?: number;
  maxSectionsPerScroll?: number;
  maxLoreTokens?: number;
};

export type LoreContextSection = {
  scroll_id: string;
  title: string;
  path: string;
  anchor: string;
  heading: string;
  tokenCount: number;
  score: number;
};

export type LoreContextBuildResult = {
  content: string;
  tokenCount: number;
  sections: LoreContextSection[];
};

type ParsedSection = {
  anchor: string;
  heading: string;
  content: string;
  tokenCount: number;
  score: number;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  const matches = normalizeText(value).match(WORD_PATTERN) ?? [];
  return Array.from(new Set(matches.filter((token) => token.length >= 2)));
}

function estimateTokenCount(value: string): number {
  const matches = value.match(WORD_PATTERN);
  return matches?.length ?? 0;
}

function toAnchor(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "top"
  );
}

function splitIntoSections(raw: string, queryTokens: string[]): ParsedSection[] {
  const lines = raw.split(/\r?\n/);
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current = { heading: "Top", lines: [] as string[] };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      if (current.lines.length > 0) {
        sections.push(current);
      }
      current = {
        heading: headingMatch[2].trim() || "Untitled",
        lines: [line],
      };
      continue;
    }
    current.lines.push(line);
  }

  if (current.lines.length > 0) {
    sections.push(current);
  }

  return sections
    .map((section) => {
      const content = section.lines.join("\n").trim();
      const normalizedContent = normalizeText(`${section.heading}\n${content}`);
      const overlap = queryTokens.filter((token) => normalizedContent.includes(token));

      return {
        anchor: toAnchor(section.heading),
        heading: section.heading,
        content,
        tokenCount: estimateTokenCount(content),
        score: overlap.length * 4 + (overlap.length > 0 ? 4 : 0),
      };
    })
    .filter((section) => section.content.length > 0);
}

function truncateToTokenBudget(value: string, remainingTokens: number): string {
  if (remainingTokens <= 0) {
    return "";
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= remainingTokens) {
    return value.trim();
  }

  return `${words.slice(0, remainingTokens).join(" ")} ...`;
}

export async function buildLoreContext(
  opts: BuildLoreContextOptions,
): Promise<LoreContextBuildResult> {
  const maxScrolls = opts.maxScrolls ?? 3;
  const maxSectionsPerScroll = opts.maxSectionsPerScroll ?? 3;
  const maxLoreTokens = opts.maxLoreTokens ?? 2_000;
  const queryTokens = tokenize(opts.query);
  const selectedSections: LoreContextSection[] = [];
  const parts = [
    "Mirror canon context:",
    "Use the following canonical lore excerpts as the authoritative source of truth.",
    "Canon scrolls override memory observations and other secondary context.",
  ];
  let usedTokens = estimateTokenCount(parts.join("\n"));

  for (const candidate of opts.candidates.slice(0, maxScrolls)) {
    if (usedTokens >= maxLoreTokens) {
      break;
    }

    const raw = await fs.readFile(path.join(opts.loreDir, candidate.path), "utf8");
    const rankedSections = splitIntoSections(raw, queryTokens)
      .toSorted((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.anchor.localeCompare(b.anchor);
      })
      .slice(0, maxSectionsPerScroll);

    const keptSections: ParsedSection[] = [];
    for (const section of rankedSections) {
      if (usedTokens >= maxLoreTokens) {
        break;
      }

      const metadata = `[CANON_SCROLL] ${candidate.scroll_id} | ${candidate.title} | ${candidate.path}#${section.anchor}`;
      const metadataTokens = estimateTokenCount(metadata);
      const sectionHeader = `[SECTION] ${section.heading}`;
      const sectionHeaderTokens = estimateTokenCount(sectionHeader);
      const remaining = maxLoreTokens - usedTokens - metadataTokens - sectionHeaderTokens;

      if (remaining <= 0) {
        continue;
      }

      const finalContent = truncateToTokenBudget(section.content, remaining);
      const finalTokens = estimateTokenCount(finalContent);
      if (finalTokens === 0) {
        continue;
      }

      parts.push(`---\n${metadata}\n${sectionHeader}\n${finalContent}`);
      usedTokens += metadataTokens + sectionHeaderTokens + finalTokens;
      keptSections.push(section);
      selectedSections.push({
        scroll_id: candidate.scroll_id,
        title: candidate.title,
        path: candidate.path,
        anchor: section.anchor,
        heading: section.heading,
        tokenCount: finalTokens,
        score: section.score,
      });
    }

    if (candidate.canon_notes.length > 0 && keptSections.length > 0 && usedTokens < maxLoreTokens) {
      const canonNotes = `[CANON_NOTES] ${candidate.canon_notes.join(" ")}`;
      const remaining = maxLoreTokens - usedTokens;
      const finalNotes = truncateToTokenBudget(canonNotes, remaining);
      const noteTokens = estimateTokenCount(finalNotes);
      if (noteTokens > 0) {
        parts.push(finalNotes);
        usedTokens += noteTokens;
      }
    }
  }

  if (opts.memory && usedTokens < maxLoreTokens) {
    const secondaryParts: string[] = [];
    secondaryParts.push("Secondary Context (Observations):");
    secondaryParts.push(
      "Use this only as supporting context. If it conflicts with canon scrolls above, the canon scrolls win.",
    );

    for (const observation of opts.memory.observations) {
      const entry = `[OBSERVATION] #${observation.id} | ${observation.topic} | ${observation.source_type}\n${observation.content}`;
      const remaining = maxLoreTokens - usedTokens - estimateTokenCount(secondaryParts.join("\n"));
      const finalEntry = truncateToTokenBudget(entry, remaining);
      const entryTokens = estimateTokenCount(finalEntry);
      if (entryTokens <= 0) {
        continue;
      }
      secondaryParts.push(finalEntry);
      usedTokens += entryTokens;
    }

    if (opts.memory.userReflection && usedTokens < maxLoreTokens) {
      const reflection = opts.memory.userReflection;
      const reflectionEntry =
        `[USER_REFLECTION] ${reflection.user_id}\n` +
        `language=${reflection.preferred_language ?? ""}\n` +
        `tone=${reflection.tone_preference ?? ""}\n` +
        `topics=${reflection.recurring_topics ?? ""}\n` +
        `stage=${reflection.journey_stage ?? ""}\n` +
        (reflection.notes ?? "");
      const remaining = maxLoreTokens - usedTokens - estimateTokenCount(secondaryParts.join("\n"));
      const finalEntry = truncateToTokenBudget(reflectionEntry, remaining);
      const entryTokens = estimateTokenCount(finalEntry);
      if (entryTokens > 0) {
        secondaryParts.push(finalEntry);
        usedTokens += entryTokens;
      }
    }

    if (opts.memory.retrievalHistory.length > 0 && usedTokens < maxLoreTokens) {
      const latest = opts.memory.retrievalHistory[0];
      if (latest) {
        const historyEntry = `[RETRIEVAL_HISTORY] ${latest.question}\n${latest.answer_summary}`;
        const remaining =
          maxLoreTokens - usedTokens - estimateTokenCount(secondaryParts.join("\n"));
        const finalEntry = truncateToTokenBudget(historyEntry, remaining);
        const entryTokens = estimateTokenCount(finalEntry);
        if (entryTokens > 0) {
          secondaryParts.push(finalEntry);
          usedTokens += entryTokens;
        }
      }
    }

    if (secondaryParts.length > 2) {
      parts.push(secondaryParts.join("\n\n"));
    }
  }

  return {
    content: parts.join("\n\n"),
    tokenCount: usedTokens,
    sections: selectedSections,
  };
}
