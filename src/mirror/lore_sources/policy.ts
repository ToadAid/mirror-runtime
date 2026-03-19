import path from "node:path";
import { resolveMirrorLoreRoot } from "../../mirror-local/paths.js";
import type { MirrorLorePolicy } from "./types.js";

export function resolveDefaultLoreRoot(explicitDir?: string): string {
  return resolveMirrorLoreRoot(explicitDir);
}

export function getDefaultLorePolicy(): MirrorLorePolicy {
  const loreRoot = resolveDefaultLoreRoot();

  return {
    canonicalDir: loreRoot,
    localDir: path.join(loreRoot, "local"),
    includeLocal: false,
  };
}
