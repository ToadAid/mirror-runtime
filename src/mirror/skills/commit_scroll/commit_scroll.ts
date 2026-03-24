import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentMirrorObservabilityContext } from "../../../mirror-observability/index.js";
import {
  reviewDraftForCanon,
  type MirrorCanonReviewResult,
  type MirrorReviewObservability,
} from "../../../mirror-review/index.js";
import { resolveLoreRetrievalRoot } from "../../lore_retrieval/index.js";
import { ensureScrollIndexUpToDate } from "../../lore_sources/scroll_index.js";
import {
  validateLoreDraftInCorpusContext,
  type MirrorLoreValidationReport,
} from "../../lore_validation/index.js";

export type CommitScrollFamily = "L" | "QA" | "C";

export type CommitScrollInput = {
  draft_scroll_content: string;
  preferred_filename?: string;
  family_override?: CommitScrollFamily;
  dry_run?: boolean;
  force?: boolean;
};

export type CommitScrollResult = {
  committed: boolean;
  family: CommitScrollFamily;
  assigned_number: number;
  final_filename: string;
  final_path: string;
  validation: MirrorLoreValidationReport;
  review?: MirrorCanonReviewResult;
  index_refresh_status: {
    rebuilt: boolean;
    reason: "missing" | "stale" | "fresh" | "no_scrolls" | "missing_dir" | "dry_run";
    scrollCount: number;
    indexPath: string;
  };
  dry_run_preview?: {
    content: string;
  };
};

const FAMILY_PREFIXES: Record<CommitScrollFamily, string> = {
  L: "TOBY_L",
  QA: "TOBY_QA",
  C: "TOBY_C",
};

function parseFrontmatter(raw: string): Record<string, string> | null {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return null;
  }

  const fields: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "---") {
      return fields;
    }
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    fields[(match[1] ?? "").trim().toLowerCase()] = (match[2] ?? "").trim();
  }

  return null;
}

function slugifyTitle(value: string): string {
  const words = value
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return words.length > 0 ? words.join("_") : "Untitled";
}

function inferFamilyFromText(raw: string): CommitScrollFamily | null {
  const fromId = /TOBY_(L|QA|C)(?:0+|\d+)/.exec(raw)?.[1];
  if (fromId === "L" || fromId === "QA" || fromId === "C") {
    return fromId;
  }

  const frontmatter = parseFrontmatter(raw);
  const familyValue = frontmatter?.family
    ?.replace(/^["']|["']$/g, "")
    .trim()
    .toUpperCase();
  if (familyValue === "L" || familyValue === "QA" || familyValue === "C") {
    return familyValue;
  }

  return null;
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
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
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        discovered.push(absolutePath);
      }
    }
  }

  await walk(rootDir);
  return discovered;
}

async function getNextFamilyNumber(loreDir: string, family: CommitScrollFamily): Promise<number> {
  const prefix = FAMILY_PREFIXES[family];
  const pattern = new RegExp(`^${prefix}(\\d+)_`);
  const files = await collectMarkdownFiles(loreDir);
  let highest = 0;

  for (const file of files) {
    const match = pattern.exec(path.basename(file));
    if (!match) {
      continue;
    }
    const numeric = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(numeric)) {
      highest = Math.max(highest, numeric);
    }
  }

  return highest + 1;
}

function replacePlaceholderIds(
  raw: string,
  family: CommitScrollFamily,
  assignedNumber: number,
): string {
  const prefix = FAMILY_PREFIXES[family];
  return raw.replaceAll(new RegExp(`${prefix}0+`, "g"), `${prefix}${assignedNumber}`);
}

function buildFinalFilename(params: {
  content: string;
  preferredFilename?: string;
  family: CommitScrollFamily;
  assignedNumber: number;
}): string {
  const prefix = `${FAMILY_PREFIXES[params.family]}${params.assignedNumber}`;
  const preferred = params.preferredFilename?.trim();
  if (preferred) {
    const basename = path.basename(preferred);
    if (!basename.toLowerCase().endsWith(".md")) {
      throw new TypeError("commit-scroll preferred_filename must end with .md");
    }
    const replaced = basename.replace(/^TOBY_(L|QA|C)(?:0+|\d+)/, prefix);
    return replaced.startsWith("TOBY_") ? replaced : `${prefix}_${replaced}`;
  }

  const frontmatter = parseFrontmatter(params.content);
  const title = frontmatter?.title?.replace(/^["']|["']$/g, "").trim();
  return `${prefix}_${slugifyTitle(title && title.length > 0 ? title : "Untitled")}.md`;
}

function validateInput(input: CommitScrollInput): Required<CommitScrollInput> {
  if (typeof input.draft_scroll_content !== "string" || input.draft_scroll_content.trim() === "") {
    throw new TypeError("commit-scroll requires draft_scroll_content");
  }
  if (
    input.preferred_filename !== undefined &&
    (typeof input.preferred_filename !== "string" || input.preferred_filename.trim() === "")
  ) {
    throw new TypeError("commit-scroll preferred_filename must be a non-empty string");
  }
  if (input.family_override !== undefined && !["L", "QA", "C"].includes(input.family_override)) {
    throw new TypeError("commit-scroll family_override must be one of L, QA, C");
  }
  if (input.dry_run !== undefined && typeof input.dry_run !== "boolean") {
    throw new TypeError("commit-scroll dry_run must be a boolean when provided");
  }
  if (input.force !== undefined && typeof input.force !== "boolean") {
    throw new TypeError("commit-scroll force must be a boolean when provided");
  }

  return {
    draft_scroll_content: input.draft_scroll_content,
    preferred_filename: input.preferred_filename ?? "",
    family_override: input.family_override ?? (undefined as never),
    dry_run: input.dry_run ?? false,
    force: input.force ?? false,
  };
}

async function writeCanonicalFileAtomically(finalPath: string, content: string): Promise<void> {
  const directory = path.dirname(finalPath);
  const fileName = path.basename(finalPath);
  const tempPath = path.join(directory, `.${fileName}.tmp-${crypto.randomUUID()}`);

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(tempPath, content, "utf8");

    try {
      await fs.stat(finalPath);
      throw new Error(`commit-scroll refuses to overwrite existing scroll: ${fileName}`);
    } catch (error) {
      const maybeErr = error as NodeJS.ErrnoException;
      if (maybeErr.code !== "ENOENT") {
        throw error;
      }
    }

    await fs.rename(tempPath, finalPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

export async function commitScroll(input: CommitScrollInput): Promise<CommitScrollResult> {
  const observability: MirrorReviewObservability = getCurrentMirrorObservabilityContext();
  const params = validateInput(input);
  const family =
    input.family_override ??
    inferFamilyFromText(params.preferred_filename) ??
    inferFamilyFromText(params.draft_scroll_content);
  if (!family) {
    throw new Error("commit-scroll could not determine scroll family");
  }

  const loreDir = resolveLoreRetrievalRoot();
  const assignedNumber = await getNextFamilyNumber(loreDir, family);
  const finalContent = replacePlaceholderIds(params.draft_scroll_content, family, assignedNumber);
  const finalFilename = buildFinalFilename({
    content: finalContent,
    preferredFilename: params.preferred_filename,
    family,
    assignedNumber,
  });
  const finalPath = path.join(loreDir, finalFilename);

  try {
    await fs.stat(finalPath);
    throw new Error(`commit-scroll refuses to overwrite existing scroll: ${finalFilename}`);
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr.code !== "ENOENT") {
      throw error;
    }
  }

  const validation = await validateLoreDraftInCorpusContext({
    loreDir,
    draftPath: finalFilename,
    draftContent: finalContent,
  });
  const review = await reviewDraftForCanon(
    {
      loreDir,
      draftContent: finalContent,
    },
    {
      observability,
    },
  );

  if (validation.warningCount > 0) {
    return {
      committed: false,
      family,
      assigned_number: assignedNumber,
      final_filename: finalFilename,
      final_path: finalPath,
      validation,
      review,
      index_refresh_status: {
        rebuilt: false,
        reason: "fresh",
        scrollCount: 0,
        indexPath: path.join(loreDir, "_index", "scroll_index.json"),
      },
    };
  }

  if (review.status === "conflict_detected" && !params.force) {
    return {
      committed: false,
      family,
      assigned_number: assignedNumber,
      final_filename: finalFilename,
      final_path: finalPath,
      validation,
      review,
      index_refresh_status: {
        rebuilt: false,
        reason: "fresh",
        scrollCount: 0,
        indexPath: path.join(loreDir, "_index", "scroll_index.json"),
      },
    };
  }

  if (params.dry_run) {
    const currentIndex = await ensureScrollIndexUpToDate(loreDir);
    return {
      committed: false,
      family,
      assigned_number: assignedNumber,
      final_filename: finalFilename,
      final_path: finalPath,
      validation,
      review,
      index_refresh_status: {
        rebuilt: false,
        reason: "dry_run",
        scrollCount: currentIndex.scrollCount,
        indexPath: currentIndex.indexPath,
      },
      dry_run_preview: {
        content: finalContent,
      },
    };
  }

  await writeCanonicalFileAtomically(finalPath, finalContent);
  const indexRefreshStatus = await ensureScrollIndexUpToDate(loreDir);

  return {
    committed: true,
    family,
    assigned_number: assignedNumber,
    final_filename: finalFilename,
    final_path: finalPath,
    validation,
    review,
    index_refresh_status: indexRefreshStatus,
  };
}
