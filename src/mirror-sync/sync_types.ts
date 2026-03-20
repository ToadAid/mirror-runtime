export type MirrorPeerSyncStatus = "idle" | "ok" | "syncing" | "error";

export type MirrorSyncPeer = {
  peer_id: string;
  base_url: string;
  last_seen_at: string;
  sync_status: MirrorPeerSyncStatus;
  last_sync_at?: string;
  last_error?: string;
};

export type MirrorCanonFileUpdate = {
  path: string;
  scroll_id: string;
  updated_at: string;
  updated_at_ms: number;
  size_bytes: number;
  sha256: string;
};

export type MirrorCanonUpdatesSnapshot = {
  lore_dir: string;
  index_path: string;
  index_version: number;
  latest_update_at: string | null;
  files: MirrorCanonFileUpdate[];
};

export type MirrorGraphSyncMetadata = {
  version: string;
  updated_at: string;
  updated_at_ms: number;
  node_count: number;
  edge_count: number;
};

export type MirrorSyncUpdatesResponse = {
  node_id: string;
  base_url: string | null;
  canon: MirrorCanonUpdatesSnapshot;
  graph: MirrorGraphSyncMetadata;
  file_contents?: Record<string, string>;
};

export type MirrorSyncConflict = {
  path: string;
  reason:
    | "local_newer"
    | "same_timestamp_different_content"
    | "remote_older_index"
    | "invalid_remote_canon"
    | "unsafe_path";
  detail: string;
};

export type MirrorSyncPullResult = {
  peer_id: string;
  peer_base_url: string;
  pulled_files: string[];
  skipped_files: Array<{ path: string; reason: string }>;
  conflicts: MirrorSyncConflict[];
  graph: {
    remote_version: string;
    local_version: string;
    rebuilt: boolean;
  };
};

export type MirrorSyncAnnounceInput = {
  peer_id: string;
  base_url: string;
};

export type MirrorSyncPullInput = {
  peer_id?: string;
  base_url?: string;
};

export type MirrorSyncActionName = "peers" | "updates" | "announce" | "pull";
