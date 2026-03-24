import {
  getCurrentMirrorObservabilityContext,
  type MirrorObservabilityContext,
} from "../mirror-observability/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type FetchLike,
  type MirrorProviderConfig,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
import { buildReflectionPrompt, reflectOnCanonContext } from "../mirror-reflection/index.js";
import { buildLoreContext, retrieveCanonicalScrolls } from "../mirror/lore_retrieval/index.js";
import { mergeMirrorCorrelation } from "./correlation.js";
import type { MirrorChatRequest, MirrorChatMessage } from "./mirror_request.js";
import type {
  MirrorChatDiagnostics,
  MirrorChatResponse,
  MirrorPreparedChatRequest,
} from "./mirror_response.js";

type MirrorChatRuntimeObservability = Pick<
  MirrorObservabilityContext,
  "recordLatency" | "logEvent"
>;

function isDebugMode(): boolean {
  const level = (process.env.MIRROR_LOG_LEVEL ?? "").toLowerCase();
  return level === "debug" || level === "trace";
}

function buildCanonSystemMessage(params: {
  content: string;
  diagnostics?: MirrorChatDiagnostics;
}): MirrorChatMessage {
  const parts = [params.content];

  if (params.diagnostics) {
    parts.push(
      `---\n[RETRIEVAL_DIAGNOSTICS]\n` +
        `lore_dir=${params.diagnostics.loreDir}\n` +
        `index_state=${params.diagnostics.indexState}\n` +
        `total_indexed=${params.diagnostics.totalIndexed}\n` +
        `returned_candidates=${params.diagnostics.returnedCandidates}`,
    );
  }

  return {
    role: "system",
    content: parts.join("\n\n"),
  };
}

function validateMirrorChatRequest(request: MirrorChatRequest): void {
  if (!request || typeof request !== "object") {
    throw new Error("request must be an object");
  }
  if (typeof request.model !== "string" || request.model.trim() === "") {
    throw new Error("model must be a non-empty string");
  }
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  for (const msg of request.messages) {
    if (!msg || typeof msg !== "object") {
      throw new Error("each message must be an object");
    }
    if (!["system", "user", "assistant"].includes(msg.role)) {
      throw new Error("role must be system, user, or assistant");
    }
    if (typeof msg.content !== "string" || msg.content.trim() === "") {
      throw new Error("content must be a non-empty string");
    }
  }
}

function resolveUserId(request: MirrorChatRequest): string | undefined {
  return request.user_id ?? request.session?.user_id;
}

export async function prepareMirrorChatRequest(
  request: MirrorChatRequest,
  deps: {
    observability?: MirrorChatRuntimeObservability;
  } = {},
): Promise<MirrorPreparedChatRequest> {
  validateMirrorChatRequest(request);
  const observability = deps.observability ?? getCurrentMirrorObservabilityContext();

  const temperature =
    request.temperature !== undefined ? Math.min(Math.max(request.temperature, 0), 1) : 0.7;
  const maxTokens =
    request.max_tokens !== undefined ? Math.min(Math.max(request.max_tokens, 1), 100_000) : 4096;
  const latestUserMessage = [...request.messages].toReversed().find((msg) => msg.role === "user");

  let retrievalMessages: MirrorChatMessage[] = [];
  let diagnostics: MirrorChatDiagnostics | undefined;

  if (latestUserMessage) {
    const retrievalStartedAt = Date.now();
    const retrieval = await retrieveCanonicalScrolls(latestUserMessage.content, {
      limit: 3,
      userId: resolveUserId(request),
    });
    const retrievalDurationMs = Date.now() - retrievalStartedAt;
    observability.recordLatency("retrieval_time_ms", retrievalDurationMs);
    observability.logEvent("chat.retrieval", {
      lore_dir: retrieval.diagnostics.loreDir,
      returned_candidates: retrieval.candidates.length,
      latency_ms: retrievalDurationMs,
    });

    if (retrieval.candidates.length > 0) {
      diagnostics = isDebugMode()
        ? {
            loreDir: retrieval.diagnostics.loreDir,
            indexState: retrieval.diagnostics.indexState,
            totalIndexed: retrieval.diagnostics.totalIndexed,
            returnedCandidates: retrieval.diagnostics.returnedCandidates,
          }
        : undefined;

      const loreContext = await buildLoreContext({
        loreDir: retrieval.diagnostics.loreDir,
        query: latestUserMessage.content,
        candidates: retrieval.candidates,
        memory: retrieval.memory,
        maxScrolls: 3,
        maxSectionsPerScroll: 3,
        maxLoreTokens: 2_000,
      });

      const reflection = await reflectOnCanonContext({
        query: latestUserMessage.content,
        loreDir: retrieval.diagnostics.loreDir,
        candidates: retrieval.candidates,
        matchedSymbols: retrieval.diagnostics.matchedSymbols,
      });

      retrievalMessages = [
        buildCanonSystemMessage({ content: loreContext.content, diagnostics }),
        {
          role: "system",
          content: buildReflectionPrompt(reflection),
        },
      ];
    }
  }

  return {
    modelRequest: {
      model: request.model,
      messages: [...retrievalMessages, ...request.messages],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    },
    diagnostics,
  };
}

export async function executeMirrorChatRequest(
  request: MirrorChatRequest,
  deps: {
    invokeModel: (
      request: MirrorPreparedChatRequest["modelRequest"],
    ) => Promise<MirrorChatResponse>;
  },
): Promise<MirrorChatResponse> {
  const prepared = await prepareMirrorChatRequest(request);
  return deps.invokeModel(prepared.modelRequest);
}

export async function executeMirrorChatWithProvider(
  request: MirrorChatRequest,
  deps: {
    observability?: MirrorChatRuntimeObservability;
    provider: MirrorProviderConfig;
    fetchImpl?: FetchLike;
    onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
  },
): Promise<MirrorChatResponse> {
  const providerPlane = createMirrorProviderPlane([
    {
      ...buildPrimaryProviderDescriptorFromConfig({
        providerUrl: deps.provider.url,
        providerAuthToken: deps.provider.authToken,
      }),
      timeoutMs: deps.provider.timeoutMs,
    },
  ]);
  return executeMirrorChatWithProviderPlane(request, {
    providerPlane,
    fetchImpl: deps.fetchImpl,
    observability: deps.observability,
    onRuntimeEvent: deps.onRuntimeEvent,
  });
}

export async function executeMirrorChatWithProviderPlane(
  request: MirrorChatRequest,
  deps: {
    observability?: MirrorChatRuntimeObservability;
    providerPlane: MirrorProviderPlane;
    fetchImpl?: FetchLike;
    onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
    correlation?: {
      trace_id?: string;
      session_id?: string;
      action_id?: string;
      provider_id?: string;
    };
  },
): Promise<MirrorChatResponse> {
  const prepared = await prepareMirrorChatRequest(request, {
    observability: deps.observability,
  });
  const correlation = mergeMirrorCorrelation(request.correlation, deps.correlation, {
    session_id: request.session?.session_id,
    provider_id:
      request.provider?.provider_id ?? deps.providerPlane.getActiveProvider()?.provider_id,
  });
  const execution = await deps.providerPlane.execute(prepared.modelRequest, {
    fetchImpl: deps.fetchImpl,
    observability: deps.observability,
    onRuntimeEvent: deps.onRuntimeEvent,
    correlation,
    selection: {
      preferredProviderId: request.provider?.provider_id,
      allowFallback: request.provider?.allow_fallback,
    },
  });
  return execution.response;
}
