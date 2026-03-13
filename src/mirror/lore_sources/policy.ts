import path from "node:path";
import type { MirrorLorePolicy } from "./types.js";

const DEFAULT_LORE_DIR = "./lore-scrolls";

export function resolveDefaultLoreRoot(explicitDir?: string): string {
  return path.resolve(explicitDir ?? process.env.MIRROR_LORE_DIR ?? DEFAULT_LORE_DIR);
}

export function getDefaultLorePolicy(): MirrorLorePolicy {
  const loreRoot = resolveDefaultLoreRoot();

  return {
    canonicalDir: loreRoot,
    localDir: path.join(loreRoot, "local"),
    includeLocal: false,
  };
}
