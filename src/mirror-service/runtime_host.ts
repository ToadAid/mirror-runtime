import crypto from "node:crypto";
import { createMirrorGateway, type MirrorGateway } from "../mirror-gateway/index.js";
import type { FetchLike, MirrorProviderConfig } from "../mirror-provider/index.js";
import type { MirrorChatRequest, MirrorChatResponse } from "../mirror-runtime/index.js";
import {
  createMirrorSyncManager,
  type MirrorSyncAnnounceInput,
  type MirrorSyncManager,
  type MirrorSyncPullInput,
} from "../mirror-sync/index.js";
import { resolveDefaultLoreRoot } from "../mirror/lore_sources/index.js";
import { createMirrordaemon, type Mirrordaemon } from "../mirrordaemon/index.js";
import type { MirrorServiceConfig } from "./config.js";
import { initializeMirrorServiceLifecycle, type MirrorServiceLifecycle } from "./lifecycle.js";

export type MirrorRuntimeHost = {
  config: MirrorServiceConfig;
  lifecycle: MirrorServiceLifecycle;
  daemon: Mirrordaemon;
  gateway: MirrorGateway;
  syncManager: MirrorSyncManager;
  executeChatWithProvider: (
    request: MirrorChatRequest,
    deps: { provider: MirrorProviderConfig; fetchImpl?: FetchLike },
  ) => Promise<MirrorChatResponse>;
  executeTool: (
    toolName: string,
    input: Record<string, unknown>,
    context?: { user_id?: string; command?: string; action?: string },
  ) => Promise<Record<string, unknown>>;
  executeSyncAction: (
    action: "peers" | "updates" | "announce" | "pull",
    input?: { peer_id?: string; base_url?: string; requested_paths?: string[] },
    context?: { user_id?: string },
  ) => Promise<Record<string, unknown>>;
  shutdown: () => Promise<void>;
};

function buildRuntimeHostConfig(overrides: Partial<MirrorServiceConfig> = {}): MirrorServiceConfig {
  return {
    port: overrides.port ?? 0,
    providerUrl: overrides.providerUrl ?? process.env.MIRROR_PROVIDER_URL ?? "",
    providerAuthToken: overrides.providerAuthToken ?? process.env.MIRROR_PROVIDER_AUTH_TOKEN ?? "",
    operatorToken:
      overrides.operatorToken ??
      (typeof process.env.MIRROR_OPERATOR_TOKEN === "string"
        ? process.env.MIRROR_OPERATOR_TOKEN
        : null),
    loreDir: overrides.loreDir ?? resolveDefaultLoreRoot(process.env.MIRROR_LORE_DIR),
    nodeId: overrides.nodeId ?? process.env.MIRROR_NODE_ID ?? "mirror-cli-local",
    baseUrl:
      overrides.baseUrl ??
      (typeof process.env.MIRROR_BASE_URL === "string" &&
      process.env.MIRROR_BASE_URL.trim().length > 0
        ? process.env.MIRROR_BASE_URL.trim()
        : null),
  };
}

function trackCliSession(
  daemon: Mirrordaemon,
  params: {
    user_id?: string;
    metadata: Record<string, unknown>;
  },
): string {
  const sessionId = crypto.randomUUID();
  daemon.createSession({
    session_id: sessionId,
    user_id: params.user_id,
    metadata: {
      surface: "cli",
      ...params.metadata,
    },
  });
  return sessionId;
}

export async function createMirrorRuntimeHost(
  overrides: Partial<MirrorServiceConfig> = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<MirrorRuntimeHost> {
  const config = buildRuntimeHostConfig(overrides);
  const lifecycle = await initializeMirrorServiceLifecycle(config);
  const daemon = createMirrordaemon({
    config,
    lifecycle,
  });
  const gateway = createMirrorGateway("/mirror");
  const syncManager = createMirrorSyncManager({
    nodeId: config.nodeId,
    loreDir: config.loreDir,
    baseUrl: config.baseUrl,
    fetchImpl: deps.fetchImpl,
  });

  return {
    config,
    lifecycle,
    daemon,
    gateway,
    syncManager,
    async executeChatWithProvider(request, runtimeDeps) {
      const userId = request.user_id ?? request.session?.user_id;
      const sessionId = trackCliSession(daemon, {
        user_id: userId,
        metadata: {
          command: "chat",
          provider_url: runtimeDeps.provider.url,
        },
      });
      try {
        return await gateway.executeChatWithProvider(request, runtimeDeps);
      } finally {
        daemon.touchSession(sessionId, {
          user_id: userId,
          metadata: {
            command: "chat",
            provider_url: runtimeDeps.provider.url,
          },
        });
      }
    },
    async executeTool(toolName, input, context = {}) {
      const sessionId = trackCliSession(daemon, {
        user_id: context.user_id,
        metadata: {
          command: context.command ?? "tool",
          action: context.action,
          tool: toolName,
        },
      });
      try {
        return await gateway.registry.executeTool(toolName, input);
      } finally {
        daemon.touchSession(sessionId, {
          user_id: context.user_id,
          metadata: {
            command: context.command ?? "tool",
            action: context.action,
            tool: toolName,
          },
        });
      }
    },
    async executeSyncAction(action, input = {}, context = {}) {
      const sessionId = trackCliSession(daemon, {
        user_id: context.user_id,
        metadata: {
          command: "sync",
          action,
        },
      });
      try {
        switch (action) {
          case "peers":
            return { peers: syncManager.listPeers() };
          case "updates":
            return await syncManager.getLocalUpdates({
              requestedPaths: input.requested_paths ?? [],
            });
          case "announce": {
            const peer = await syncManager.announcePeer({
              peer_id: input.peer_id ?? "",
              base_url: input.base_url ?? "",
            } satisfies MirrorSyncAnnounceInput);
            const updates = await syncManager.getLocalUpdates();
            return {
              peer,
              local: {
                node_id: updates.node_id,
                base_url: updates.base_url,
              },
            };
          }
          case "pull":
            return await syncManager.pullFromPeer({
              peer_id: input.peer_id,
              base_url: input.base_url,
            } satisfies MirrorSyncPullInput);
        }
      } finally {
        daemon.touchSession(sessionId, {
          user_id: context.user_id,
          metadata: {
            command: "sync",
            action,
          },
        });
      }
    },
    async shutdown() {
      await lifecycle.shutdown();
    },
  };
}
