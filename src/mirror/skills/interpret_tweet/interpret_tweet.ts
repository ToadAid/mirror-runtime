import fs from "node:fs/promises";
import path from "node:path";
import {
  loadSymbolRegistry,
  resolveLoreRetrievalRoot,
  retrieveCanonicalScrolls,
  type MirrorSymbolRegistryEntry,
} from "../../lore_retrieval/index.js";
import type { ForgeScrollInput } from "../forge_scroll/index.js";

export type InterpretTweetFamily = "L" | "QA" | "C";

export type InterpretTweetInput = {
  tweet_text: string;
  date?: string;
  source_ref?: string;
  preferred_family?: InterpretTweetFamily;
};

export type InterpretTweetResult = {
  suggested_title: string;
  suggested_family: InterpretTweetFamily;
  interpreted_meaning: string;
  key_marks: string[];
  oracle_lines: string[];
  operations_draft: string;
  suggested_symbols: string[];
  suggested_topics: string[];
  suggested_anchors: {
    prev?: string;
    next?: string;
    related_scrolls: string[];
  };
  forge_scroll_payload: ForgeScrollInput;
};

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9$]+/g)
      ?.filter(Boolean) ?? []
  );
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => (part.length > 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}

function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferFamily(
  tweetText: string,
  preferredFamily?: InterpretTweetFamily,
): InterpretTweetFamily {
  if (preferredFamily) {
    return preferredFamily;
  }
  if (tweetText.includes("?")) {
    return "QA";
  }
  if (
    /\b(cancelled|canceled|clarify|clarified|correction|corrected|not|no longer|vs)\b/i.test(
      tweetText,
    )
  ) {
    return "C";
  }
  return "L";
}

function extractKeyMarks(tweetText: string): string[] {
  const marks = new Set<string>();
  for (const match of tweetText.matchAll(/[#@$][A-Za-z0-9_]+/g)) {
    marks.add(match[0]);
  }
  for (const match of tweetText.matchAll(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu)) {
    const symbol = match[0];
    if (symbol.trim()) {
      marks.add(symbol);
    }
  }
  return [...marks];
}

async function collectRelatedCanonSymbols(
  registry: MirrorSymbolRegistryEntry[],
  relativePaths: string[],
): Promise<string[]> {
  const loreDir = resolveLoreRetrievalRoot();
  const knownSymbols = registry.map((entry) => entry.symbol);
  const found = new Set<string>();

  for (const relativePath of relativePaths.slice(0, 2)) {
    try {
      const raw = await fs.readFile(path.join(loreDir, relativePath), "utf8");
      for (const symbol of knownSymbols) {
        if (raw.includes(symbol)) {
          found.add(symbol);
        }
      }
    } catch {
      continue;
    }
  }

  return [...found];
}

function extractOracleLines(tweetText: string): string[] {
  return tweetText
    .split(/\r?\n|[.!?]+/)
    .map((line) => normalizePhrase(line))
    .filter(Boolean)
    .slice(0, 3);
}

function collectTopicCandidates(tweetText: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "this",
    "that",
    "what",
    "when",
    "where",
    "will",
    "your",
    "have",
    "about",
    "through",
    "would",
    "could",
    "there",
    "their",
    "they",
    "them",
    "just",
    "then",
    "than",
  ]);
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const token of tokenize(tweetText)) {
    if (token.length < 4 || stopWords.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    topics.push(token);
  }
  return topics.slice(0, 6);
}

function pickSuggestedSymbols(
  registry: MirrorSymbolRegistryEntry[],
  tweetText: string,
  keyMarks: string[],
): string[] {
  const tokens = new Set(tokenize(tweetText));
  const suggestions = new Set<string>(keyMarks.filter((mark) => mark.length <= 4));

  for (const entry of registry) {
    if (keyMarks.includes(entry.symbol)) {
      suggestions.add(entry.symbol);
      continue;
    }
    if (entry.concepts.some((concept) => tokenize(concept).some((token) => tokens.has(token)))) {
      suggestions.add(entry.symbol);
    }
  }

  return [...suggestions];
}

function buildSuggestedTitle(
  family: InterpretTweetFamily,
  topics: string[],
  symbols: string[],
  relatedTitle?: string,
): string {
  if (relatedTitle && family === "C") {
    return `Clarification of ${relatedTitle.replaceAll("_", " ")}`;
  }
  const titleTopics = topics.slice(0, 4).map((topic) => titleCase(topic));
  if (titleTopics.length > 0) {
    return titleTopics.join(" ");
  }
  if (symbols.length > 0) {
    return `${symbols[0]} Interpretation`;
  }
  return family === "QA"
    ? "Traveler Question"
    : family === "C"
      ? "Canon Clarification"
      : "Lore Interpretation";
}

function buildMeaning(params: {
  family: InterpretTweetFamily;
  topics: string[];
  symbols: string[];
  oracleLines: string[];
  relatedTitle?: string;
}): string {
  const topicPhrase = params.topics.length > 0 ? params.topics.join(", ") : "an unnamed turning";
  const symbolPhrase =
    params.symbols.length > 0 ? ` Symbol signals: ${params.symbols.join(" ")}.` : "";
  const canonPhrase = params.relatedTitle
    ? ` It appears adjacent to existing canon around ${params.relatedTitle.replaceAll("_", " ")}.`
    : "";
  const mode =
    params.family === "QA"
      ? "The tweet reads as a traveler question seeking canon framing."
      : params.family === "C"
        ? "The tweet reads as a canon clarification or correction."
        : "The tweet reads as a lore-bearing observation.";
  const oraclePhrase =
    params.oracleLines[0] !== undefined ? ` Core line: "${params.oracleLines[0]}".` : "";
  return `${mode} Likely themes: ${topicPhrase}.${symbolPhrase}${canonPhrase}${oraclePhrase}`;
}

function buildOperationsDraft(params: {
  meaning: string;
  topics: string[];
  sourceRef?: string;
  date?: string;
  relatedScrolls: string[];
}): string {
  const lines = [
    "Interpretation Summary:",
    params.meaning,
    "",
    `Topics: ${params.topics.join(", ") || "none inferred"}`,
  ];
  if (params.date) {
    lines.push(`Observed date: ${params.date}`);
  }
  if (params.sourceRef) {
    lines.push(`Source reference: ${params.sourceRef}`);
  }
  if (params.relatedScrolls.length > 0) {
    lines.push(`Nearby canon: ${params.relatedScrolls.join(", ")}`);
  }
  lines.push("", "Forge as a new draft only after checking canon overlap and drift.");
  return lines.join("\n");
}

function buildForgePayload(params: {
  title: string;
  family: InterpretTweetFamily;
  meaning: string;
  oracleLines: string[];
  symbols: string[];
  relatedScrolls: string[];
}): ForgeScrollInput {
  return {
    title: params.title,
    category: params.family,
    narrative: [params.meaning, ...params.oracleLines].filter(Boolean).join("\n\n"),
    symbols: params.symbols,
    anchors: params.relatedScrolls[0]
      ? {
          prev: params.relatedScrolls[0],
        }
      : undefined,
  };
}

function validateInput(input: InterpretTweetInput): InterpretTweetInput {
  if (typeof input.tweet_text !== "string" || input.tweet_text.trim().length === 0) {
    throw new TypeError("interpret-tweet requires tweet_text");
  }
  if (input.date !== undefined && typeof input.date !== "string") {
    throw new TypeError("interpret-tweet date must be a string when provided");
  }
  if (input.source_ref !== undefined && typeof input.source_ref !== "string") {
    throw new TypeError("interpret-tweet source_ref must be a string when provided");
  }
  if (input.preferred_family !== undefined && !["L", "QA", "C"].includes(input.preferred_family)) {
    throw new TypeError("interpret-tweet preferred_family must be one of L, QA, C");
  }
  return input;
}

export async function interpretTweet(input: InterpretTweetInput): Promise<InterpretTweetResult> {
  const params = validateInput(input);
  const registry = await loadSymbolRegistry();
  const family = inferFamily(params.tweet_text, params.preferred_family);
  const keyMarks = extractKeyMarks(params.tweet_text);
  const oracleLines = extractOracleLines(params.tweet_text);
  const suggestedTopics = collectTopicCandidates(params.tweet_text);
  const retrieval = await retrieveCanonicalScrolls(params.tweet_text, { limit: 3 });
  const relatedScrolls = retrieval.candidates.map((candidate) => candidate.path);
  const relatedCanonSymbols = await collectRelatedCanonSymbols(registry, relatedScrolls);
  const suggestedSymbols = Array.from(
    new Set([
      ...pickSuggestedSymbols(registry, params.tweet_text, keyMarks),
      ...relatedCanonSymbols,
    ]),
  );
  const relatedTitle = retrieval.candidates[0]?.title;
  const suggestedTitle = buildSuggestedTitle(
    family,
    suggestedTopics,
    suggestedSymbols,
    relatedTitle,
  );
  const interpretedMeaning = buildMeaning({
    family,
    topics: suggestedTopics,
    symbols: suggestedSymbols,
    oracleLines,
    relatedTitle,
  });
  const operationsDraft = buildOperationsDraft({
    meaning: interpretedMeaning,
    topics: suggestedTopics,
    sourceRef: params.source_ref,
    date: params.date,
    relatedScrolls,
  });
  const forgeScrollPayload = buildForgePayload({
    title: suggestedTitle,
    family,
    meaning: interpretedMeaning,
    oracleLines,
    symbols: suggestedSymbols,
    relatedScrolls,
  });

  return {
    suggested_title: suggestedTitle,
    suggested_family: family,
    interpreted_meaning: interpretedMeaning,
    key_marks: keyMarks,
    oracle_lines: oracleLines,
    operations_draft: operationsDraft,
    suggested_symbols: suggestedSymbols,
    suggested_topics: suggestedTopics,
    suggested_anchors: {
      prev: relatedScrolls[0],
      related_scrolls: relatedScrolls,
    },
    forge_scroll_payload: forgeScrollPayload,
  };
}
