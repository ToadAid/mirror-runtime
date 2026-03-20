import express from "express";
import { incrementMetric, logMirrorEvent } from "../mirror-observability/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import {
  applyRemoteCanonUpdates,
  collectLocalCanonUpdates,
  getLocalCanonContents,
} from "./canon_sync.js";
import { syncLocalGraphFromRemote, collectLocalGraphMetadata } from "./graph_sync.js";
import { createMirrorPeerRegistry, type MirrorPeerRegistry } from "./peer_registry.js";
import {
  buildMirrorSyncAnnounceUrl,
  buildMirrorSyncUpdatesUrl,
  normalizeMirrorPeerBaseUrl,
} from "./sync_protocol.js";
import type {
  MirrorSyncAnnounceInput,
  MirrorSyncPeer,
  MirrorSyncPullInput,
  MirrorSyncPullResult,
  MirrorSyncUpdatesResponse,
} from "./sync_types.js";

export type MirrorSyncManager = {
  announcePeer: (input: MirrorSyncAnnounceInput) => Promise<MirrorSyncPeer>;
  listPeers: () => MirrorSyncPeer[];
  getLocalUpdates: (params?: { requestedPaths?: string[] }) => Promise<MirrorSyncUpdatesResponse>;
  pullFromPeer: (input: MirrorSyncPullInput) => Promise<MirrorSyncPullResult>;
  setLocalBaseUrl: (baseUrl: string) => void;
  getLocalBaseUrl: () => string | null;
  registry: MirrorPeerRegistry;
};

export type MirrorSyncHandlers = {
  announce: (req: express.Request, res: express.Response) => Promise<unknown>;
  peers: (req: express.Request, res: express.Response) => Promise<unknown>;
  updates: (req: express.Request, res: express.Response) => Promise<unknown>;
  pull: (req: express.Request, res: express.Response) => Promise<unknown>;
};

type MirrorSyncManagerOptions = {
  nodeId: string;
  loreDir: string;
  baseUrl?: string | null;
  fetchImpl?: FetchLike;
  registry?: MirrorPeerRegistry;
  onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`sync request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

function parseRequestBodyObject<T>(req: express.Request, fallback: T): T | Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : fallback;
}

export function parseMirrorSyncAnnounceInput(req: express.Request): MirrorSyncAnnounceInput | null {
  const payload = parseRequestBodyObject(req, null);
  if (!payload || typeof payload.peer_id !== "string" || typeof payload.base_url !== "string") {
    return null;
  }
  return payload as MirrorSyncAnnounceInput;
}

export function parseMirrorSyncUpdatesInput(req: express.Request): { requested_paths: string[] } {
  if (req.query.include_content !== "1") {
    return { requested_paths: [] };
  }
  const raw = typeof req.query.paths === "string" ? req.query.paths : "";
  return {
    requested_paths: raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  };
}

export function parseMirrorSyncPullInput(
  req: express.Request,
): MirrorSyncPullInput & Record<string, unknown> {
  return parseRequestBodyObject(req, {});
}

export async function wrapMirrorSyncPullResponse(
  res: express.Response,
  execute: () => Promise<Record<string, unknown>>,
): Promise<unknown> {
  try {
    return res.json(await execute());
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}

export async function executeMirrorSyncAction(
  manager: MirrorSyncManager,
  action: "peers" | "updates" | "announce" | "pull",
  input: { peer_id?: string; base_url?: string; requested_paths?: string[] } = {},
): Promise<Record<string, unknown>> {
  switch (action) {
    case "peers":
      return { peers: manager.listPeers() };
    case "updates":
      return await manager.getLocalUpdates({
        requestedPaths: input.requested_paths ?? [],
      });
    case "announce": {
      const peer = await manager.announcePeer({
        peer_id: input.peer_id ?? "",
        base_url: input.base_url ?? "",
      } satisfies MirrorSyncAnnounceInput);
      const updates = await manager.getLocalUpdates();
      return {
        peer,
        local: {
          node_id: updates.node_id,
          base_url: updates.base_url,
        },
      };
    }
    case "pull":
      return await manager.pullFromPeer({
        peer_id: input.peer_id,
        base_url: input.base_url,
      } satisfies MirrorSyncPullInput);
  }
}

function resolveMirrorSyncPullPeer(
  input: MirrorSyncPullInput,
  registry: MirrorPeerRegistry,
): MirrorSyncPeer | undefined {
  return (
    (input.peer_id ? registry.getPeer(input.peer_id) : undefined) ??
    (input.base_url
      ? {
          peer_id: input.base_url,
          base_url: normalizeMirrorPeerBaseUrl(input.base_url),
          last_seen_at: new Date().toISOString(),
          sync_status: "idle" as const,
        }
      : undefined)
  );
}

async function fetchMirrorSyncUpdates(
  fetchImpl: FetchLike,
  peerBaseUrl: string,
  requestedPaths: string[] = [],
): Promise<MirrorSyncUpdatesResponse> {
  return await parseJsonResponse<MirrorSyncUpdatesResponse>(
    await fetchImpl(buildMirrorSyncUpdatesUrl(peerBaseUrl, requestedPaths)),
  );
}

function collectMirrorSyncPullNeededPaths(
  localUpdates: MirrorSyncUpdatesResponse,
  remoteUpdates: MirrorSyncUpdatesResponse,
): string[] {
  const localFiles = new Map(localUpdates.canon.files.map((file) => [file.path, file]));
  return remoteUpdates.canon.files
    .filter((remoteFile) => {
      const localFile = localFiles.get(remoteFile.path);
      return !localFile || localFile.sha256 !== remoteFile.sha256;
    })
    .map((file) => file.path);
}

export function createMirrorSyncManager(options: MirrorSyncManagerOptions): MirrorSyncManager {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registry = options.registry ?? createMirrorPeerRegistry();
  let localBaseUrl = options.baseUrl ? normalizeMirrorPeerBaseUrl(options.baseUrl) : null;

  return {
    async announcePeer(input) {
      options.onRuntimeEvent?.("sync.announce.started", {
        peer_id: input.peer_id,
        base_url: input.base_url,
      });
      const peer = registry.registerPeer({
        peer_id: input.peer_id,
        base_url: normalizeMirrorPeerBaseUrl(input.base_url),
      });
      options.onRuntimeEvent?.("sync.announce.finished", {
        peer_id: peer.peer_id,
        base_url: peer.base_url,
      });
      logMirrorEvent("sync.peer.announced", {
        peer_id: peer.peer_id,
        base_url: peer.base_url,
      });
      return peer;
    },
    listPeers() {
      return registry.listPeers();
    },
    async getLocalUpdates(params = {}) {
      options.onRuntimeEvent?.("sync.updates.requested", {
        requested_paths: params.requestedPaths?.length ?? 0,
      });
      const canon = await collectLocalCanonUpdates(options.loreDir);
      const graph = await collectLocalGraphMetadata(options.loreDir);
      const requestedPaths = params.requestedPaths ?? [];
      return {
        node_id: options.nodeId,
        base_url: localBaseUrl,
        canon,
        graph,
        file_contents:
          requestedPaths.length > 0
            ? await getLocalCanonContents(options.loreDir, requestedPaths)
            : undefined,
      };
    },
    async pullFromPeer(input) {
      const peer = resolveMirrorSyncPullPeer(input, registry);

      if (!peer) {
        throw new Error("mirror sync pull requires a known peer_id or base_url");
      }

      registry.registerPeer({ peer_id: peer.peer_id, base_url: peer.base_url });
      registry.markStatus(peer.peer_id, "syncing");
      options.onRuntimeEvent?.("sync.pull.started", {
        peer_id: peer.peer_id,
        base_url: peer.base_url,
      });

      try {
        if (localBaseUrl) {
          await fetchImpl(buildMirrorSyncAnnounceUrl(peer.base_url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              peer_id: options.nodeId,
              base_url: localBaseUrl,
            } satisfies MirrorSyncAnnounceInput),
          }).catch(() => undefined);
        }

        const remoteUpdates = await fetchMirrorSyncUpdates(fetchImpl, peer.base_url);
        const localUpdates = await this.getLocalUpdates();
        const neededPaths = collectMirrorSyncPullNeededPaths(localUpdates, remoteUpdates);

        const remoteContents =
          neededPaths.length > 0
            ? ((await fetchMirrorSyncUpdates(fetchImpl, peer.base_url, neededPaths))
                .file_contents ?? {})
            : {};

        const canonResult = await applyRemoteCanonUpdates({
          loreDir: options.loreDir,
          local: localUpdates.canon,
          remote: remoteUpdates.canon,
          remoteContents,
        });

        const graphResult = await syncLocalGraphFromRemote({
          loreDir: options.loreDir,
          remoteGraph: remoteUpdates.graph,
        });

        registry.markStatus(peer.peer_id, "ok");
        options.onRuntimeEvent?.("sync.pull.finished", {
          peer_id: peer.peer_id,
          pulled_files: canonResult.pulledFiles.length,
          conflicts: canonResult.conflicts.length,
          graph_rebuilt: graphResult.rebuilt,
        });
        logMirrorEvent("sync.pull.completed", {
          peer_id: peer.peer_id,
          pulled_files: canonResult.pulledFiles.length,
          conflicts: canonResult.conflicts.length,
          graph_rebuilt: graphResult.rebuilt,
        });

        return {
          peer_id: peer.peer_id,
          peer_base_url: peer.base_url,
          pulled_files: canonResult.pulledFiles,
          skipped_files: canonResult.skippedFiles,
          conflicts: canonResult.conflicts,
          graph: {
            remote_version: remoteUpdates.graph.version,
            local_version: graphResult.localGraph.version,
            rebuilt: graphResult.rebuilt,
          },
        };
      } catch (error) {
        incrementMetric("sync_failures");
        registry.markStatus(peer.peer_id, "error", String(error));
        options.onRuntimeEvent?.("sync.pull.failed", {
          peer_id: peer.peer_id,
          error: String(error),
        });
        logMirrorEvent("sync.pull.failed", {
          peer_id: peer.peer_id,
          error: String(error),
        });
        throw error;
      }
    },
    setLocalBaseUrl(baseUrl: string) {
      localBaseUrl = normalizeMirrorPeerBaseUrl(baseUrl);
    },
    getLocalBaseUrl() {
      return localBaseUrl;
    },
    registry,
  };
}

export function createMirrorSyncHandlers(manager: MirrorSyncManager): MirrorSyncHandlers {
  return {
    announce: async (req: express.Request, res: express.Response) => {
      const payload = parseMirrorSyncAnnounceInput(req);
      if (!payload) {
        return res.status(400).json({ error: "peer_id and base_url are required" });
      }

      return res.json(await executeMirrorSyncAction(manager, "announce", payload));
    },
    peers: async (_req: express.Request, res: express.Response) => {
      return res.json(await executeMirrorSyncAction(manager, "peers"));
    },
    updates: async (req: express.Request, res: express.Response) => {
      return res.json(
        await executeMirrorSyncAction(manager, "updates", parseMirrorSyncUpdatesInput(req)),
      );
    },
    pull: async (req: express.Request, res: express.Response) => {
      const payload = parseMirrorSyncPullInput(req);
      return await wrapMirrorSyncPullResponse(
        res,
        async () => await executeMirrorSyncAction(manager, "pull", payload),
      );
    },
  };
}

export function createMirrorSyncRouter(
  manager: MirrorSyncManager,
  handlers = createMirrorSyncHandlers(manager),
): express.Router {
  const router = express.Router();
  router.post("/mirror-sync/announce", handlers.announce);
  router.get("/mirror-sync/updates", handlers.updates);
  router.post("/mirror-sync/pull", handlers.pull);
  router.get("/mirror-sync/peers", handlers.peers);
  return router;
}
