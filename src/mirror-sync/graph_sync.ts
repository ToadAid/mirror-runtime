import crypto from "node:crypto";
import path from "node:path";
import { buildLoreGraph } from "../mirror-lore-graph/index.js";
import { collectLocalCanonUpdates } from "./canon_sync.js";
import type { MirrorGraphSyncMetadata } from "./sync_types.js";

export async function collectLocalGraphMetadata(loreDir: string): Promise<MirrorGraphSyncMetadata> {
  const canon = await collectLocalCanonUpdates(loreDir);
  const graph = await buildLoreGraph(loreDir);
  const versionSource = [
    path.resolve(loreDir),
    String(canon.index_version),
    canon.latest_update_at ?? "",
    String(graph.nodes.length),
    String(graph.edges.length),
  ].join(":");

  const updatedAtMs =
    canon.latest_update_at !== null
      ? new Date(canon.latest_update_at).getTime()
      : canon.index_version;

  return {
    version: crypto.createHash("sha256").update(versionSource).digest("hex"),
    updated_at: new Date(updatedAtMs).toISOString(),
    updated_at_ms: updatedAtMs,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
  };
}

export async function syncLocalGraphFromRemote(params: {
  loreDir: string;
  remoteGraph: MirrorGraphSyncMetadata;
}): Promise<{ localGraph: MirrorGraphSyncMetadata; rebuilt: boolean }> {
  const localGraph = await collectLocalGraphMetadata(params.loreDir);
  if (
    params.remoteGraph.version === localGraph.version ||
    params.remoteGraph.updated_at_ms <= localGraph.updated_at_ms
  ) {
    return { localGraph, rebuilt: false };
  }

  const rebuiltGraph = await collectLocalGraphMetadata(params.loreDir);
  return { localGraph: rebuiltGraph, rebuilt: true };
}
