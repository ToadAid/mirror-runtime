export type { MirrorLoreDiscoveredFile, MirrorLorePolicy, MirrorLoreSourceKind } from "./types.js";
export { discoverLoreFiles } from "./discover.js";
export { getDefaultLorePolicy, resolveDefaultLoreRoot } from "./policy.js";
export { ensureScrollIndexUpToDate } from "./scroll_index.js";
export { getLastLoreValidationReport, validateLoreCorpus } from "../lore_validation/index.js";
