import {
  createMirrorActionRuntime,
  createMirrorActionsFromTools,
  createMirrorToolRegistryFromActionRuntime,
  type MirrorActionRuntime,
} from "../mirror-actions/index.js";
import {
  buildMirrorChatPolicyTarget,
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

export function createMirrorGateway(
  basePath = "/mirror",
  options: { providerPlane?: MirrorProviderPlane } = {},
): MirrorGateway {
  const registry = createMirrorToolRegistry(getMirrorNativeSkillTools());
  const actionRuntime = createMirrorActionRuntime(
    createMirrorActionsFromTools(registry.listTools()),
  );
  const toolRegistry = createMirrorToolRegistryFromActionRuntime(actionRuntime);
  const policy = createMirrorPolicyEngine();
  const handlers = createMirrorGatewayHandlers(toolRegistry, {
    actionRuntime,
    policy,
    providerPlane: options.providerPlane,
  });
  const router = createMirrorGatewayRouter(basePath, handlers);

  return {
    actionRuntime,
    registry: toolRegistry,
    policy,
    providerPlane: options.providerPlane,
    handlers,
    router,
    async executeChat(request, deps, context = { surface: "gateway" }) {
      ensureMirrorPolicyAllowed(
        await policy.evaluate({
          phase: "ingress",
          target: buildMirrorChatPolicyTarget(request),
          context,
        }),
      );
      return executeMirrorChatRequest(request, deps);
    },
    async executeChatWithProvider(request, deps, context = { surface: "gateway" }) {
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
      });
    },
    async executeTool(toolName, input, context = { surface: "gateway" }) {
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
    },
  };
}
