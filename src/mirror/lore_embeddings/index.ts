export type { BuildLoreEmbeddingSourcesOptions } from "./builder.js";
export { buildLoreEmbeddingSources } from "./builder.js";
export type { MirrorEmbeddingIndexRebuildReport } from "./index_builder.js";
export { rebuildCanonicalEmbeddingIndex } from "./index_builder.js";
export type { MirrorEmbeddingSource } from "./policy.js";
export { allowCanonical, rejectCanonical, rejectLocal } from "./policy.js";
