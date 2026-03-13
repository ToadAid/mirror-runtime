import { setMetricGauge } from "../mirror-observability/index.js";
import type { MirrorSyncPeer, MirrorPeerSyncStatus } from "./sync_types.js";

export type MirrorPeerRegistry = {
  registerPeer: (peer: { peer_id: string; base_url: string }) => MirrorSyncPeer;
  listPeers: () => MirrorSyncPeer[];
  getPeer: (peerId: string) => MirrorSyncPeer | undefined;
  markStatus: (peerId: string, status: MirrorPeerSyncStatus, error?: string) => void;
};

export function createMirrorPeerRegistry(): MirrorPeerRegistry {
  const peers = new Map<string, MirrorSyncPeer>();

  function updateGauge(): void {
    setMetricGauge("peers_known", peers.size);
  }

  return {
    registerPeer(peer) {
      const current = peers.get(peer.peer_id);
      const next: MirrorSyncPeer = {
        peer_id: peer.peer_id,
        base_url: peer.base_url,
        last_seen_at: new Date().toISOString(),
        sync_status: current?.sync_status ?? "idle",
        last_sync_at: current?.last_sync_at,
        last_error: current?.last_error,
      };
      peers.set(peer.peer_id, next);
      updateGauge();
      return next;
    },
    listPeers() {
      return [...peers.values()].toSorted((a, b) => a.peer_id.localeCompare(b.peer_id));
    },
    getPeer(peerId) {
      return peers.get(peerId);
    },
    markStatus(peerId, status, error) {
      const current = peers.get(peerId);
      if (!current) {
        return;
      }
      current.sync_status = status;
      if (status === "ok") {
        current.last_sync_at = new Date().toISOString();
        current.last_error = undefined;
      } else if (status === "error") {
        current.last_error = error ?? "sync failed";
      }
    },
  };
}
