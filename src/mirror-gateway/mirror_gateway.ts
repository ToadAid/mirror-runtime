import type { FetchLike, MirrorProviderConfig } from "../mirror-provider/index.js";
import {
  executeMirrorChatRequest,
  executeMirrorChatWithProvider,
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
  registry: MirrorToolRegistry;
  handlers: MirrorGatewayHandlers;
  router: ReturnType<typeof createMirrorGatewayRouter>;
  executeChat: (
    request: MirrorChatRequest,
    deps: { invokeModel: (request: MirrorModelRequest) => Promise<MirrorChatResponse> },
  ) => Promise<MirrorChatResponse>;
  executeChatWithProvider: (
    request: MirrorChatRequest,
    deps: { provider: MirrorProviderConfig; fetchImpl?: FetchLike },
  ) => Promise<MirrorChatResponse>;
};

export function createMirrorGateway(basePath = "/mirror"): MirrorGateway {
  const registry = createMirrorToolRegistry(getMirrorNativeSkillTools());
  const handlers = createMirrorGatewayHandlers(registry);
  const router = createMirrorGatewayRouter(basePath, handlers);

  return {
    registry,
    handlers,
    router,
    executeChat: (request, deps) => executeMirrorChatRequest(request, deps),
    executeChatWithProvider: (request, deps) => executeMirrorChatWithProvider(request, deps),
  };
}
