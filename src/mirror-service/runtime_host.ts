import crypto from "node:crypto";
import type {
  MirrorAdapterRequestEnvelope,
  MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import { buildCliChatAdapterEnvelope } from "../mirror-adapters/index.js";
import { createMirrorGateway, type MirrorGateway } from "../mirror-gateway/index.js";
import { runWithMirrorObservabilityContext } from "../mirror-observability/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type FetchLike,
  type MirrorProviderConfig,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
import type { MirrorChatRequest, MirrorChatResponse } from "../mirror-runtime/index.js";
import { withMirrorCorrelation } from "../mirror-runtime/index.js";
import {
  createMirrorSyncManager,
  type MirrorSyncActionName,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import { resolveDefaultLoreRoot } from "../mirror/lore_sources/index.js";
import { createMirrordaemon, type Mirrordaemon } from "../mirrordaemon/index.js";
import type { MirrorServiceConfig } from "./config.js";
import { initializeMirrorServiceLifecycle, type MirrorServiceLifecycle } from "./lifecycle.js";
import { executeMirrorRuntimeSyncAction } from "./sync_runtime.js";
import { executeMirrorRuntimeTool } from "./tool_runtime.js";

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
  executeAdapterRequest: (
    envelope: MirrorAdapterRequestEnvelope,
    deps?: { fetchImpl?: FetchLike; provider?: MirrorProviderConfig },
  ) => Promise<MirrorAdapterResponseEnvelope>;
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
    action: MirrorSyncActionName,
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
    async executeChatWithProvider(this: MirrorRuntimeHost, request, runtimeDeps) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        const envelope = buildCliChatAdapterEnvelope({
          model: request.model,
          messages: request.messages,
          userId: request.user_id ?? request.session?.user_id,
          command: "chat",
          temperature: request.temperature,
          maxTokens: request.max_tokens,
          stream: request.stream,
          preferredProvider: request.provider?.provider_id,
        });
        const response = await this.executeAdapterRequest(
          {
            ...envelope,
            // Runtime-host helper calls are programmatic, not local CLI ingress.
            context: {
              ...envelope.context,
              adapter: {
                ...envelope.context.adapter,
                adapter_id: "mirror-runtime-host",
                surface: "custom",
                transport: "programmatic",
              },
            },
            request: {
              ...envelope.request,
              messages: request.messages.map((message) => ({ ...message })),
            },
          },
          runtimeDeps,
        );
        if (response.kind !== "chat.response") {
          throw new Error(`Unexpected Mirror adapter response kind: ${response.kind}`);
        }
        return response.response;
      });
    },
    async executeAdapterRequest(envelope, runtimeDeps = {}) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        const sessionId =
          envelope.context.session?.session_id ?? envelope.context.session?.external_session_id;
        const userId = envelope.context.actor?.user_id ?? envelope.context.actor?.external_user_id;
        const traceId =
          envelope.context.runtime?.trace_id ??
          envelope.context.runtime?.correlation_id ??
          envelope.envelope_id;
        const correlation = {
          trace_id: traceId,
          session_id: sessionId,
          action_id: envelope.context.action?.tool_call_id,
        };
        const isCliIngress = envelope.context.adapter.adapter_id === "mirror-cli";
        const sessionMetadata =
          envelope.context.session?.metadata &&
          typeof envelope.context.session.metadata === "object" &&
          !Array.isArray(envelope.context.session.metadata)
            ? envelope.context.session.metadata
            : undefined;
        if (sessionId) {
          const existing = daemon.getSession(sessionId);
          if (existing) {
            daemon.touchSession(sessionId, {
              user_id: userId,
              metadata: {
                surface: envelope.context.adapter.adapter_id,
                ...sessionMetadata,
              },
            });
          } else {
            daemon.createSession({
              session_id: sessionId,
              user_id: userId,
              metadata: {
                surface: envelope.context.adapter.adapter_id,
                ...sessionMetadata,
              },
            });
          }
        }
        const actionId = envelope.context.action?.tool_call_id ?? crypto.randomUUID();
        const executionId = crypto.randomUUID();
        try {
          if (isCliIngress && envelope.kind === "chat.request") {
            daemon.publishRuntimeEvent(
              "chat.started",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  model: envelope.request.model,
                },
                correlation,
              ),
            );
          }
          if (isCliIngress && envelope.kind === "tool.request") {
            daemon.publishRuntimeEvent(
              "tool.execution.started",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  tool: envelope.request.tool_name,
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
            daemon.publishRuntimeEvent(
              "action.execution.started",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  action: envelope.request.tool_name,
                  execution_id: executionId,
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
          }
          const response = await gateway.executeAdapterRequest(envelope, {
            provider: runtimeDeps.provider,
            providerPlane: runtimeDeps.provider ? undefined : providerPlane,
            fetchImpl: runtimeDeps.fetchImpl ?? deps.fetchImpl,
            onRuntimeEvent: daemon.publishRuntimeEvent,
            correlation,
          });
          if (isCliIngress && envelope.kind === "chat.request") {
            daemon.publishRuntimeEvent(
              "chat.finished",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  model: response.kind === "chat.response" ? response.response.model : undefined,
                },
                correlation,
              ),
            );
          }
          if (isCliIngress && envelope.kind === "tool.request") {
            daemon.publishRuntimeEvent(
              "tool.execution.finished",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  tool: envelope.request.tool_name,
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
            daemon.publishRuntimeEvent(
              "action.execution.finished",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  action: envelope.request.tool_name,
                  execution_id: executionId,
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
          }
          if (sessionId) {
            daemon.touchSession(sessionId, {
              user_id: userId,
              metadata: {
                surface: envelope.context.adapter.adapter_id,
                ...sessionMetadata,
              },
            });
          }
          return response;
        } catch (error) {
          if (isCliIngress && envelope.kind === "chat.request") {
            daemon.publishRuntimeEvent(
              "chat.failed",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  model: envelope.request.model,
                  error: String(error),
                },
                correlation,
              ),
            );
          }
          if (isCliIngress && envelope.kind === "tool.request") {
            daemon.publishRuntimeEvent(
              "tool.execution.failed",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  tool: envelope.request.tool_name,
                  error: String(error),
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
            daemon.publishRuntimeEvent(
              "action.execution.failed",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  action: envelope.request.tool_name,
                  execution_id: executionId,
                  error: String(error),
                },
                {
                  ...correlation,
                  action_id: actionId,
                },
              ),
            );
          }
          throw error;
        }
      });
    },
    async executeTool(toolName, input, context = {}) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        return await executeMirrorRuntimeTool({
          daemon,
          gateway,
          providerPlane,
          toolName,
          input,
          context,
          trackCliSession,
        });
      });
    },
    async executeSyncAction(action, input = {}, context = {}) {
      return await runWithMirrorObservabilityContext(daemon.getObservability(), async () => {
        return await executeMirrorRuntimeSyncAction(
          {
            daemon,
            gateway,
            syncManager,
          },
          action,
          input,
          context,
        );
      });
    },
    async shutdown() {
      await lifecycle.shutdown();
    },
  };
}
