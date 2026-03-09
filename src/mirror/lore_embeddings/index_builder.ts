import type { BuildLoreEmbeddingSourcesOptions } from "./builder.js";
import { buildLoreEmbeddingSources } from "./builder.js";

export type MirrorEmbeddingIndexRebuildReport = {
  rebuilt: boolean;
  totalFiles: number;
  embedded: number;
  rejected: number;
};

function isCanonicalPath(path: string, canonicalDir: string): boolean {
  const prefix = canonicalDir.split("\\").join("/").replace(/\/$/, "");
  const normalized = path.split("\\").join("/");
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

export async function rebuildCanonicalEmbeddingIndex(
  opts: BuildLoreEmbeddingSourcesOptions,
): Promise<MirrorEmbeddingIndexRebuildReport> {
  const sources = await buildLoreEmbeddingSources(opts);
  const canonical = sources.filter((source) => isCanonicalPath(source.path, opts.canonicalDir));

  const hasSignatureFailure = canonical.some(
    (source) => !source.trusted && source.reason === "manifest_signature_invalid",
  );

  if (hasSignatureFailure) {
    return {
      rebuilt: false,
      totalFiles: canonical.length,
      embedded: 0,
      rejected: canonical.length,
    };
  }

  const embedded = canonical.filter((source) => source.trusted).length;
  const rejected = canonical.length - embedded;

  return {
    rebuilt: true,
    totalFiles: canonical.length,
    embedded,
    rejected,
  };
}
