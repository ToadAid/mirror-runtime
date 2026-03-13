import crypto from "node:crypto";
import type { MirrorActionLifecycleEvent } from "../mirror-actions/index.js";
import { createMirrorGateway, type MirrorGateway } from "../mirror-gateway/index.js";
import { runWithMirrorObservabilityContext } from "../mirror-observability/index.js";
import {
  buildMirrorActionPolicyTarget,
  buildMirrorChatPolicyTarget,
  buildMirrorProviderPolicyTarget,
  type MirrorPolicyContext,
} from "../mirror-policy/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type FetchLike,
  type MirrorProviderConfig,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
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
  providerPlane: MirrorProviderPlane;
  syncManager: MirrorSyncManager;
  executeChatWithProvider: (
    request: MirrorChatRequest,
    deps: { provider: MirrorProviderConfig; fetchImpl?: FetchLike },
  ) => Promise<MirrorChatResponse>;
  executeTool: (
    toolName: string,
    input: Record<string, unknown>,
    context?: {
      user_id?: string;
      command?: string;
      action?: string;
      operator_token?: string | null;
    },
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
  const providerPlane = createMirrorProviderPlane([
    {
      ...buildPrimaryProviderDescriptorFromConfig(config),
    },
  ]);
  const daemon = createMirrordaemon({
    config,
    lifecycle,
    providerPlane,
  });
  const gateway = createMirrorGateway("/mirror", { providerPlane });
  const defaultProviderConfigured = providerPlane
    .listProviders()
    .some((provider) => provider.configured);
  const syncManager = createMirrorSyncManager({
    nodeId: config.nodeId,
    loreDir: config.loreDir,
    baseUrl: config.baseUrl,
    fetchImpl: deps.fetchImpl,
    onRuntimeEvent: daemon.publishRuntimeEvent,
  });

  return {
    config,
    lifecycle,
    daemon,
    gateway,
    providerPlane,
    syncManager,
    async executeChatWithProvider(request, runtimeDeps) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        const userId = request.user_id ?? request.session?.user_id;
        const sessionId = trackCliSession(daemon, {
          user_id: userId,
          metadata: {
            command: "chat",
            provider_url: runtimeDeps.provider.url,
          },
        });
        const policyContext: MirrorPolicyContext = {
          surface: "cli",
          command: "chat",
          actor: {
            user_id: userId,
          },
          session: {
            session_id: sessionId,
          },
          metadata: {
            provider_url: runtimeDeps.provider.url,
          },
        };
        try {
          const ingressPolicy = await gateway.policy.evaluate({
            phase: "ingress",
            target: buildMirrorChatPolicyTarget(request),
            context: policyContext,
          });
          if (!ingressPolicy.allowed) {
            daemon.publishRuntimeEvent("policy.denied", {
              session_id: sessionId,
              phase: "ingress",
              target: "chat",
              code: ingressPolicy.decision.code,
            });
            throw new Error(ingressPolicy.decision.reason);
          }
          const providerPolicy = await gateway.policy.evaluate({
            phase: "provider",
            target: buildMirrorProviderPolicyTarget(request, {
              url: providerPlane.getActiveProvider()?.url ?? runtimeDeps.provider.url,
            }),
            context: policyContext,
          });
          if (!providerPolicy.allowed) {
            daemon.publishRuntimeEvent("policy.denied", {
              session_id: sessionId,
              phase: "provider",
              target: "provider",
              code: providerPolicy.decision.code,
            });
            throw new Error(providerPolicy.decision.reason);
          }
          daemon.publishRuntimeEvent("chat.started", {
            session_id: sessionId,
            model: request.model,
          });
          return await gateway.executeChatWithProvider(request, {
            ...runtimeDeps,
            providerPlane: defaultProviderConfigured ? providerPlane : undefined,
            onRuntimeEvent: daemon.publishRuntimeEvent,
          });
        } catch (error) {
          daemon.publishRuntimeEvent("chat.failed", {
            session_id: sessionId,
            model: request.model,
            error: String(error),
          });
          throw error;
        } finally {
          daemon.publishRuntimeEvent("chat.finished", {
            session_id: sessionId,
            model: request.model,
          });
          daemon.touchSession(sessionId, {
            user_id: userId,
            metadata: {
              command: "chat",
              provider_url: runtimeDeps.provider.url,
            },
          });
        }
      });
    },
    async executeTool(toolName, input, context = {}) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        const sessionId = trackCliSession(daemon, {
          user_id: context.user_id,
          metadata: {
            command: context.command ?? "tool",
            action: context.action,
            tool: toolName,
          },
        });
        const policyContext: MirrorPolicyContext = {
          surface: "cli",
          command: context.command ?? "tool",
          request_token: context.operator_token ?? null,
          actor: {
            user_id: context.user_id,
          },
          session: {
            session_id: sessionId,
          },
          metadata: {
            action: context.action,
            tool: toolName,
          },
        };
        try {
          const action = gateway.actionRuntime.getAction(toolName);
          if (!action) {
            throw new Error(`Unknown Mirror tool: ${toolName}`);
          }
          const result = await gateway.actionRuntime.executeAction(
            {
              action_name: toolName,
              input,
              context: policyContext,
              policy: gateway.policy,
              providerPlane,
            },
            {
              onLifecycleEvent(event: MirrorActionLifecycleEvent) {
                if (event.type === "started") {
                  daemon.publishRuntimeEvent("tool.execution.started", {
                    session_id: sessionId,
                    tool: event.action.action_name,
                  });
                  daemon.publishRuntimeEvent("action.execution.started", {
                    session_id: sessionId,
                    action: event.action.action_name,
                    execution_id: event.execution_id,
                  });
                  return;
                }
                if (event.type === "finished") {
                  daemon.publishRuntimeEvent("tool.execution.finished", {
                    session_id: sessionId,
                    tool: event.action.action_name,
                  });
                  daemon.publishRuntimeEvent("action.execution.finished", {
                    session_id: sessionId,
                    action: event.action.action_name,
                    execution_id: event.execution_id,
                  });
                  return;
                }
                daemon.publishRuntimeEvent("tool.execution.failed", {
                  session_id: sessionId,
                  tool: event.action.action_name,
                  error: event.result.error,
                });
                daemon.publishRuntimeEvent("action.execution.failed", {
                  session_id: sessionId,
                  action: event.action.action_name,
                  execution_id: event.execution_id,
                  error: event.result.error,
                });
              },
            },
          );
          const reviewStatus =
            result.result.review && typeof result.result.review === "object"
              ? (result.result.review as { status?: unknown }).status
              : undefined;
          if (typeof reviewStatus === "string") {
            daemon.publishRuntimeEvent("review.decision", {
              session_id: sessionId,
              tool: toolName,
              status: reviewStatus,
            });
          }
          return result.result;
        } catch (error) {
          const code =
            error &&
            typeof error === "object" &&
            "code" in error &&
            typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : undefined;
          if (code) {
            daemon.publishRuntimeEvent("policy.denied", {
              session_id: sessionId,
              phase: "action",
              target: "action",
              action: toolName,
              code,
            });
          }
          daemon.publishRuntimeEvent("tool.execution.failed", {
            session_id: sessionId,
            tool: toolName,
            error: String(error),
          });
          throw error;
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
      });
    },
    async executeSyncAction(action, input = {}, context = {}) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        const sessionId = trackCliSession(daemon, {
          user_id: context.user_id,
          metadata: {
            command: "sync",
            action,
          },
        });
        const policyDecision = await gateway.policy.evaluate({
          phase: "action",
          target: buildMirrorActionPolicyTarget(`sync.${action}`, input),
          context: {
            surface: "cli",
            command: "sync",
            actor: {
              user_id: context.user_id,
            },
            session: {
              session_id: sessionId,
            },
            metadata: {
              action,
            },
          },
        });
        try {
          if (!policyDecision.allowed) {
            daemon.publishRuntimeEvent("policy.denied", {
              session_id: sessionId,
              phase: "action",
              target: "action",
              action: `sync.${action}`,
              code: policyDecision.decision.code,
            });
            throw new Error(policyDecision.decision.reason);
          }
          daemon.publishRuntimeEvent("sync.action.started", {
            session_id: sessionId,
            action,
          });
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
        } catch (error) {
          daemon.publishRuntimeEvent("sync.action.failed", {
            session_id: sessionId,
            action,
            error: String(error),
          });
          throw error;
        } finally {
          daemon.publishRuntimeEvent("sync.action.finished", {
            session_id: sessionId,
            action,
          });
          daemon.touchSession(sessionId, {
            user_id: context.user_id,
            metadata: {
              command: "sync",
              action,
            },
          });
        }
      });
    },
    async shutdown() {
      await lifecycle.shutdown();
    },
  };
}
