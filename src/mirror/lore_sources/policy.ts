import type { MirrorLorePolicy } from "./types.js";

export function getDefaultLorePolicy(): MirrorLorePolicy {
  return {
    canonicalDir: "lore/canonical",
    localDir: "lore/local",
    includeLocal: false,
  };
}
