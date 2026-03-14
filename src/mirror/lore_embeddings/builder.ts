import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyManifestSignature } from "../lore_manifest/signature.js";
import type { MirrorLoreManifest } from "../lore_manifest/types.js";
import { verifyLoreManifest } from "../lore_manifest/verify.js";
import { discoverLoreFiles } from "../lore_sources/discover.js";
import {
  allowCanonical,
  rejectCanonical,
  rejectLocal,
  type MirrorEmbeddingSource,
} from "./policy.js";

export type BuildLoreEmbeddingSourcesOptions = {
  canonicalDir: string;
  localDir: string;
  manifestPath: string;
  signaturePath?: string;
  publicKeyPem: string;
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function canonicalOutputPath(canonicalDir: string, relPath: string): string {
  return toPosixPath(path.join(canonicalDir, relPath));
}

function parseManifest(raw: string, manifestPath: string): MirrorLoreManifest {
  try {
    return JSON.parse(raw) as MirrorLoreManifest;
  } catch (error) {
    throw new Error(`Invalid lore manifest JSON at ${manifestPath}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

export async function buildLoreEmbeddingSources(
  opts: BuildLoreEmbeddingSourcesOptions,
): Promise<MirrorEmbeddingSource[]> {
  const manifestRaw = await readFile(opts.manifestPath, "utf8");
  const manifest = parseManifest(manifestRaw, opts.manifestPath);
  const manifestEntries =
    "scrolls" in manifest
      ? new Set(manifest.scrolls.map((entry) => entry.path))
      : new Set<string>();

  const [signatureResult, hashReport, discovered] = await Promise.all([
    verifyManifestSignature({
      manifestPath: opts.manifestPath,
      signaturePath: opts.signaturePath,
      publicKeyPem: opts.publicKeyPem,
    }),
    verifyLoreManifest({
      manifest,
      baseDir: opts.canonicalDir,
    }),
    discoverLoreFiles({
      canonicalDir: opts.canonicalDir,
      localDir: opts.localDir,
      includeLocal: true,
    }),
  ]);

  const missing = new Set(hashReport.missing);
  const mismatched = new Set(hashReport.mismatched.map((entry) => entry.path));

  const sources: MirrorEmbeddingSource[] = [];
  const seen = new Set<string>();

  for (const file of discovered) {
    if (file.kind === "local") {
      const outPath = toPosixPath(path.join(opts.localDir, file.path));
      sources.push(rejectLocal(outPath));
      continue;
    }

    const outPath = canonicalOutputPath(opts.canonicalDir, file.path);
    if (!signatureResult.ok) {
      sources.push(rejectCanonical(outPath, "manifest_signature_invalid"));
      seen.add(file.path);
      continue;
    }

    if (mismatched.has(file.path)) {
      sources.push(rejectCanonical(outPath, "canonical_mismatch"));
      seen.add(file.path);
      continue;
    }

    if (!manifestEntries.has(file.path)) {
      sources.push(rejectCanonical(outPath, "canonical_unlisted"));
      seen.add(file.path);
      continue;
    }

    sources.push(allowCanonical(outPath));
    seen.add(file.path);
  }

  for (const missingPath of missing) {
    if (seen.has(missingPath)) {
      continue;
    }
    sources.push(
      rejectCanonical(canonicalOutputPath(opts.canonicalDir, missingPath), "canonical_missing"),
    );
  }

  sources.sort((a, b) => a.path.localeCompare(b.path));
  return sources;
}
