export {
  loadLoreHelperIndexes,
  resolveLoreRetrievalRoot,
  retrieveCanonicalScrolls,
} from "./service.js";
export { buildLoreContext } from "./context_builder.js";
export { loadSymbolRegistry } from "./symbol_registry.js";
export type {
  MirrorLoreHelperIndexes,
  MirrorLoreRetrievalCandidate,
  MirrorLoreRetrievalDiagnostics,
  MirrorLoreRetrievalResult,
  MirrorLoreSupersedesEntry,
  RetrieveCanonicalScrollsOptions,
} from "./types.js";
export type {
  BuildLoreContextOptions,
  LoreContextBuildResult,
  LoreContextSection,
} from "./context_builder.js";
export type { MirrorSymbolRegistryEntry } from "./symbol_registry.js";
