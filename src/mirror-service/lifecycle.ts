import { initMirrorMemoryDb, closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { discoverLoreFiles, getDefaultLorePolicy } from "../mirror/lore_sources/index.js";
import { ensureScrollIndexUpToDate } from "../mirror/lore_sources/scroll_index.js";
import type { MirrorServiceConfig } from "./config.js";

export type MirrorServiceLifecycle = {
  discoveredLoreFiles: number;
  shutdown: () => Promise<void>;
};

export async function initializeMirrorServiceLifecycle(
  config: MirrorServiceConfig,
): Promise<MirrorServiceLifecycle> {
  process.env.MIRROR_LORE_DIR = config.loreDir;
  if (config.operatorToken) {
    process.env.MIRROR_OPERATOR_TOKEN = config.operatorToken;
  } else {
    delete process.env.MIRROR_OPERATOR_TOKEN;
  }

  initMirrorMemoryDb();
  const policy = getDefaultLorePolicy();
  const discovered = await discoverLoreFiles(policy);
  await ensureScrollIndexUpToDate(config.loreDir);

  return {
    discoveredLoreFiles: discovered.length,
    async shutdown() {
      closeMirrorMemoryDb();
    },
  };
}
