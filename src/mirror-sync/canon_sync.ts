import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureScrollIndexUpToDate } from "../mirror/lore_sources/index.js";
import { validateLoreDraftInCorpusContext } from "../mirror/lore_validation/index.js";
import type {
  MirrorCanonFileUpdate,
  MirrorCanonUpdatesSnapshot,
  MirrorSyncConflict,
} from "./sync_types.js";

type MirrorCanonSyncMetricHooks = {
  onConflictWarning?: () => void;
  onUpdatesPulled?: (count: number) => void;
};

async function listCanonicalMarkdownFiles(loreDir: string): Promise<string[]> {
  const files: string[] = [];

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
        files.push(path.relative(loreDir, absolutePath).split(path.sep).join("/"));
      }
    }
  }

  await walk(loreDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function readScrollId(relativePath: string): string {
  return path.basename(relativePath).split("_").slice(0, 2).join("_");
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function toIso(valueMs: number): string {
  return new Date(valueMs).toISOString();
}

function resolveSafeCanonPath(loreDir: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    return null;
  }
  const normalized = relativePath.split("/").join(path.sep);
  const resolved = path.resolve(loreDir, normalized);
  const loreRoot = path.resolve(loreDir);
  if (!resolved.startsWith(`${loreRoot}${path.sep}`) && resolved !== loreRoot) {
    return null;
  }
  if (!resolved.toLowerCase().endsWith(".md")) {
    return null;
  }
  return resolved;
}

async function writeCanonFileAtomically(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(targetPath)}.sync-tmp-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

export async function collectLocalCanonUpdates(
  loreDir: string,
): Promise<MirrorCanonUpdatesSnapshot> {
  const ensured = await ensureScrollIndexUpToDate(loreDir);
  const files = await listCanonicalMarkdownFiles(loreDir);
  const metadata: MirrorCanonFileUpdate[] = [];

  for (const relativePath of files) {
    const absolutePath = path.join(loreDir, relativePath);
    const stat = await fs.stat(absolutePath);
    metadata.push({
      path: relativePath,
      scroll_id: readScrollId(relativePath),
      updated_at: toIso(stat.mtimeMs),
      updated_at_ms: stat.mtimeMs,
      size_bytes: stat.size,
      sha256: await sha256File(absolutePath),
    });
  }

  const indexStat = await fs
    .stat(ensured.indexPath)
    .catch(() => ({ mtimeMs: 0 }) as { mtimeMs: number });
  const latestUpdateAtMs = metadata.reduce((max, file) => Math.max(max, file.updated_at_ms), 0);

  return {
    lore_dir: path.resolve(loreDir),
    index_path: ensured.indexPath,
    index_version: indexStat.mtimeMs,
    latest_update_at: latestUpdateAtMs > 0 ? toIso(latestUpdateAtMs) : null,
    files: metadata,
  };
}

export async function getLocalCanonContents(
  loreDir: string,
  requestedPaths: string[],
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const relativePath of requestedPaths) {
    const safePath = resolveSafeCanonPath(loreDir, relativePath);
    if (!safePath) {
      continue;
    }
    contents[relativePath] = await fs.readFile(safePath, "utf8");
  }
  return contents;
}

export async function applyRemoteCanonUpdates(params: {
  loreDir: string;
  local: MirrorCanonUpdatesSnapshot;
  remote: MirrorCanonUpdatesSnapshot;
  remoteContents: Record<string, string>;
  metrics?: MirrorCanonSyncMetricHooks;
}): Promise<{
  pulledFiles: string[];
  skippedFiles: Array<{ path: string; reason: string }>;
  conflicts: MirrorSyncConflict[];
}> {
  const localByPath = new Map(params.local.files.map((file) => [file.path, file]));
  const remoteByPath = new Map(params.remote.files.map((file) => [file.path, file]));
  const pulledFiles: string[] = [];
  const skippedFiles: Array<{ path: string; reason: string }> = [];
  const conflicts: MirrorSyncConflict[] = [];

  for (const remoteFile of remoteByPath.values()) {
    const safePath = resolveSafeCanonPath(params.loreDir, remoteFile.path);
    if (!safePath) {
      params.metrics?.onConflictWarning?.();
      conflicts.push({
        path: remoteFile.path,
        reason: "unsafe_path",
        detail: "remote path is outside the lore root",
      });
      continue;
    }

    const localFile = localByPath.get(remoteFile.path);
    if (localFile && localFile.sha256 === remoteFile.sha256) {
      skippedFiles.push({ path: remoteFile.path, reason: "already_current" });
      continue;
    }

    if (localFile && localFile.updated_at_ms > remoteFile.updated_at_ms) {
      params.metrics?.onConflictWarning?.();
      conflicts.push({
        path: remoteFile.path,
        reason: "local_newer",
        detail: "local file is newer than remote metadata",
      });
      continue;
    }

    if (
      localFile &&
      localFile.updated_at_ms === remoteFile.updated_at_ms &&
      localFile.sha256 !== remoteFile.sha256
    ) {
      params.metrics?.onConflictWarning?.();
      conflicts.push({
        path: remoteFile.path,
        reason: "same_timestamp_different_content",
        detail: "matching timestamps with different content require manual review",
      });
      continue;
    }

    if (
      localFile &&
      params.remote.index_version < params.local.index_version &&
      remoteFile.updated_at_ms <= localFile.updated_at_ms
    ) {
      params.metrics?.onConflictWarning?.();
      conflicts.push({
        path: remoteFile.path,
        reason: "remote_older_index",
        detail: "remote index version is older than the local index version",
      });
      continue;
    }

    const content = params.remoteContents[remoteFile.path];
    if (typeof content !== "string") {
      skippedFiles.push({ path: remoteFile.path, reason: "missing_remote_content" });
      continue;
    }

    const validation = await validateLoreDraftInCorpusContext({
      loreDir: params.loreDir,
      draftPath: remoteFile.path,
      draftContent: content,
    });
    if (validation.warningCount > 0) {
      params.metrics?.onConflictWarning?.();
      conflicts.push({
        path: remoteFile.path,
        reason: "invalid_remote_canon",
        detail: validation.warnings.map((warning) => warning.code).join(", "),
      });
      continue;
    }

    await writeCanonFileAtomically(safePath, content);
    pulledFiles.push(remoteFile.path);
  }

  if (pulledFiles.length > 0) {
    await ensureScrollIndexUpToDate(params.loreDir);
    params.metrics?.onUpdatesPulled?.(pulledFiles.length);
  }

  return {
    pulledFiles,
    skippedFiles,
    conflicts,
  };
}
