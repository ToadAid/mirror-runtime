import {
  createMirrorActionRuntime,
  createMirrorActionsFromTools,
  createMirrorToolRegistryFromActionRuntime,
  type MirrorActionRuntime,
} from "../mirror-actions/index.js";
import {
  buildAdapterChatResponseEnvelope,
  buildAdapterToolResponseEnvelope,
  buildCliChatAdapterEnvelope,
  normalizeAdapterDescriptor,
  toMirrorChatRequestFromAdapter,
  toMirrorToolExecutionFromAdapter,
  type MirrorAdapterRequestEnvelope,
  type MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import {
  buildMirrorChatPolicyTarget,
  buildMirrorAdapterPolicyTarget,
  buildMirrorProviderPolicyTarget,
  createMirrorPolicyEngine,
  ensureMirrorPolicyAllowed,
  type MirrorPolicyContext,
  type MirrorPolicyEngine,
} from "../mirror-policy/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type FetchLike,
  type MirrorProviderConfig,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
import {
  executeMirrorChatRequest,
  executeMirrorChatWithProviderPlane,
  type MirrorChatRequest,
  type MirrorChatResponse,
  type MirrorModelRequest,
} from "../mirror-runtime/index.js";
import {
  createMirrorToolRegistry,
  getMirrorNativeSkillTools,
  type MirrorToolRegistry,
} from "../mirror/skills/index.js";
import {
  createMirrorGatewayHandlers,
  createMirrorGatewayRouter,
  type MirrorGatewayHandlers,
} from "./routes.js";

export type MirrorGateway = {
  actionRuntime: MirrorActionRuntime;
  registry: MirrorToolRegistry;
  policy: MirrorPolicyEngine;
  providerPlane?: MirrorProviderPlane;
  handlers: MirrorGatewayHandlers;
  router: ReturnType<typeof createMirrorGatewayRouter>;
  executeAdapterRequest: (
    envelope: MirrorAdapterRequestEnvelope,
    deps?: {
      provider?: MirrorProviderConfig;
      providerPlane?: MirrorProviderPlane;
      fetchImpl?: FetchLike;
      onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
      correlation?: {
        trace_id?: string;
        session_id?: string;
        action_id?: string;
        provider_id?: string;
      };
    },
  ) => Promise<MirrorAdapterResponseEnvelope>;
  executeChat: (
    request: MirrorChatRequest,
    deps: { invokeModel: (request: MirrorModelRequest) => Promise<MirrorChatResponse> },
    context?: MirrorPolicyContext,
  ) => Promise<MirrorChatResponse>;
  executeChatWithProvider: (
    request: MirrorChatRequest,
    deps: {
      provider: MirrorProviderConfig;
      providerPlane?: MirrorProviderPlane;
      fetchImpl?: FetchLike;
      onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
      correlation?: {
        trace_id?: string;
        session_id?: string;
        action_id?: string;
        provider_id?: string;
      };
    },
    context?: MirrorPolicyContext,
  ) => Promise<MirrorChatResponse>;
  executeTool: (
    toolName: string,
    input: Record<string, unknown>,
    context?: MirrorPolicyContext,
  ) => Promise<Record<string, unknown>>;
};

function resolveProviderPlane(
  deps: {
    provider?: MirrorProviderConfig;
    providerPlane?: MirrorProviderPlane;
  },
  fallback?: MirrorProviderPlane,
): MirrorProviderPlane {
  const fallbackConfigured =
    fallback?.listProviders().some((provider) => provider.configured) ?? false;
  if (deps.providerPlane) {
    return deps.providerPlane;
  }
  if (fallbackConfigured && fallback) {
    return fallback;
  }
  if (!deps.provider) {
    if (fallback) {
      return fallback;
    }
    throw new Error("Mirror provider is not configured");
  }
  return createMirrorProviderPlane([
    {
      ...buildPrimaryProviderDescriptorFromConfig({
        providerUrl: deps.provider.url,
        providerAuthToken: deps.provider.authToken,
      }),
      timeoutMs: deps.provider.timeoutMs,
    },
  ]);
}

function readAdapterRequestToken(
  envelope: MirrorAdapterRequestEnvelope,
): string | null | undefined {
  const token = envelope.context.policy?.facts?.mirror_operator_token;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
}

function buildAdapterPolicyContext(envelope: MirrorAdapterRequestEnvelope): MirrorPolicyContext {
  const actor = envelope.context.actor;
  const session = envelope.context.session;
  const runtime = envelope.context.runtime;
  const adapterSurface =
    envelope.context.adapter.surface === "cli" ||
    envelope.context.adapter.surface === "service" ||
    envelope.context.adapter.surface === "console"
      ? envelope.context.adapter.surface
      : "adapter";

  return {
    surface: adapterSurface,
    request_token: readAdapterRequestToken(envelope),
    actor: actor
      ? {
          user_id: actor.user_id,
          external_user_id: actor.external_user_id,
          display_name: actor.display_name,
          is_operator: actor.is_operator,
          roles: actor.roles ? [...actor.roles] : undefined,
          metadata: actor.metadata ? { ...actor.metadata } : undefined,
        }
      : undefined,
    session: session
      ? {
          session_id: session.session_id ?? session.external_session_id,
          external_session_id: session.external_session_id,
          conversation_id: session.conversation_id,
          thread_id: session.thread_id,
          channel_id: session.channel_id,
          metadata: session.metadata ? { ...session.metadata } : undefined,
        }
      : undefined,
    adapter: normalizeAdapterDescriptor(envelope.context.adapter),
    metadata: {
      trace_id: runtime?.trace_id ?? runtime?.correlation_id ?? envelope.envelope_id,
      correlation_id: runtime?.correlation_id,
      priority: runtime?.priority,
      envelope_id: envelope.envelope_id,
      envelope_kind: envelope.kind,
      requested_mode: envelope.context.policy?.requested_mode,
    },
  };
}

export function createMirrorGateway(
  basePath = "/mirror",
  options: { providerPlane?: MirrorProviderPlane; policy?: MirrorPolicyEngine } = {},
): MirrorGateway {
  const registry = createMirrorToolRegistry(getMirrorNativeSkillTools());
  const actionRuntime = createMirrorActionRuntime(
    createMirrorActionsFromTools(registry.listTools()),
  );
  const toolRegistry = createMirrorToolRegistryFromActionRuntime(actionRuntime);
  const policy = options.policy ?? createMirrorPolicyEngine();

  async function executeChatWithProviderInternal(
    request: MirrorChatRequest,
    deps: {
      provider?: MirrorProviderConfig;
      providerPlane?: MirrorProviderPlane;
      fetchImpl?: FetchLike;
      onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
      correlation?: {
        trace_id?: string;
        session_id?: string;
        action_id?: string;
        provider_id?: string;
      };
    },
    context: MirrorPolicyContext = { surface: "gateway" },
  ): Promise<MirrorChatResponse> {
    const providerPlane = resolveProviderPlane(deps, options.providerPlane);
    ensureMirrorPolicyAllowed(
      await policy.evaluate({
        phase: "ingress",
        target: buildMirrorChatPolicyTarget(request),
        context,
      }),
    );
    ensureMirrorPolicyAllowed(
      await policy.evaluate({
        phase: "provider",
        target: buildMirrorProviderPolicyTarget(request, {
          url: providerPlane.getActiveProvider()?.url ?? deps.provider?.url ?? "",
        }),
        context: {
          ...context,
          metadata: {
            ...context.metadata,
            provider_url: providerPlane.getActiveProvider()?.url ?? deps.provider?.url ?? "",
          },
        },
      }),
    );
    return executeMirrorChatWithProviderPlane(request, {
      providerPlane,
      fetchImpl: deps.fetchImpl,
      onRuntimeEvent: deps.onRuntimeEvent,
      correlation: deps.correlation,
    });
  }

  async function executeToolInternal(
    toolName: string,
    input: Record<string, unknown>,
    context: MirrorPolicyContext = { surface: "gateway" },
  ): Promise<Record<string, unknown>> {
    const tool = registry.getTool(toolName);
    const action = actionRuntime.getAction(toolName);
    if (!tool || !action) {
      throw new Error(`Unknown Mirror tool: ${toolName}`);
    }
    const result = await actionRuntime.executeAction({
      action_name: toolName,
      input,
      context,
      policy,
      providerPlane: options.providerPlane,
    });
    return result.result;
  }

  async function executeAdapterRequestInternal(
    envelope: MirrorAdapterRequestEnvelope,
    deps: {
      provider?: MirrorProviderConfig;
      providerPlane?: MirrorProviderPlane;
      fetchImpl?: FetchLike;
      onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
      correlation?: {
        trace_id?: string;
        session_id?: string;
        action_id?: string;
        provider_id?: string;
      };
    } = {},
  ): Promise<MirrorAdapterResponseEnvelope> {
    const context = buildAdapterPolicyContext(envelope);
    ensureMirrorPolicyAllowed(
      await policy.evaluate({
        phase: "adapter",
        target: buildMirrorAdapterPolicyTarget({
          adapter: context.adapter ?? normalizeAdapterDescriptor(envelope.context.adapter),
          envelopeKind: envelope.kind,
        }),
        context,
      }),
    );

    if (envelope.kind === "chat.request") {
      const response = await executeChatWithProviderInternal(
        toMirrorChatRequestFromAdapter(envelope),
        deps,
        context,
      );
      return buildAdapterChatResponseEnvelope({
        request: envelope,
        response,
      });
    }

    const execution = toMirrorToolExecutionFromAdapter(envelope);
    const result = await executeToolInternal(execution.toolName, execution.input, context);
    return buildAdapterToolResponseEnvelope({
      request: envelope,
      result,
    });
  }

  const handlers = createMirrorGatewayHandlers(toolRegistry, {
    actionRuntime,
    policy,
    providerPlane: options.providerPlane,
    executeAdapterRequest: executeAdapterRequestInternal,
  });
  const router = createMirrorGatewayRouter(basePath, handlers);

  return {
    actionRuntime,
    registry: toolRegistry,
    policy,
    providerPlane: options.providerPlane,
    handlers,
    router,
    async executeAdapterRequest(envelope, deps = {}) {
      return await executeAdapterRequestInternal(envelope, deps);
    },
    async executeChat(request, deps, context = { surface: "gateway" }) {
      const envelope = buildCliChatAdapterEnvelope({
        model: request.model,
        messages: request.messages,
        userId: request.user_id ?? request.session?.user_id ?? context.actor?.user_id,
        command: context.command ?? "chat",
        action: typeof context.metadata?.action === "string" ? context.metadata.action : undefined,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        stream: request.stream,
        preferredProvider: request.provider?.provider_id,
      });
      const adapterEnvelope = {
        ...envelope,
        // Public gateway helper calls are programmatic, not local CLI ingress.
        context: {
          ...envelope.context,
          adapter: {
            ...envelope.context.adapter,
            adapter_id: "mirror-gateway",
            surface: "custom" as const,
            transport: "programmatic",
          },
        },
        request: {
          ...envelope.request,
          messages: request.messages.map((message) => ({ ...message })),
        },
      };
      const adapterContext = buildAdapterPolicyContext(adapterEnvelope);
      ensureMirrorPolicyAllowed(
        await policy.evaluate({
          phase: "adapter",
          target: buildMirrorAdapterPolicyTarget({
            adapter:
              adapterContext.adapter ?? normalizeAdapterDescriptor(adapterEnvelope.context.adapter),
            envelopeKind: adapterEnvelope.kind,
          }),
          context: adapterContext,
        }),
      );
      const adapterRequest = toMirrorChatRequestFromAdapter(adapterEnvelope);
      ensureMirrorPolicyAllowed(
        await policy.evaluate({
          phase: "ingress",
          target: buildMirrorChatPolicyTarget(adapterRequest),
          context: adapterContext,
        }),
      );
      return executeMirrorChatRequest(adapterRequest, deps);
    },
    async executeChatWithProvider(request, deps, context = { surface: "gateway" }) {
      const envelope = buildCliChatAdapterEnvelope({
        model: request.model,
        messages: request.messages,
        userId: request.user_id ?? request.session?.user_id ?? context.actor?.user_id,
        command: context.command ?? "chat",
        action: typeof context.metadata?.action === "string" ? context.metadata.action : undefined,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        stream: request.stream,
        preferredProvider: request.provider?.provider_id,
      });
      const response = await executeAdapterRequestInternal(
        {
          ...envelope,
          // Public gateway helper calls are programmatic, not local CLI ingress.
          context: {
            ...envelope.context,
            adapter: {
              ...envelope.context.adapter,
              adapter_id: "mirror-gateway",
              surface: "custom",
              transport: "programmatic",
            },
          },
          request: {
            ...envelope.request,
            messages: request.messages.map((message) => ({ ...message })),
          },
        },
        deps,
      );
      if (response.kind !== "chat.response") {
        throw new Error(`Unexpected Mirror adapter response kind: ${response.kind}`);
      }
      return response.response;
    },
    async executeTool(toolName, input, context = { surface: "gateway" }) {
      return await executeToolInternal(toolName, input, context);
    },
  };
}
