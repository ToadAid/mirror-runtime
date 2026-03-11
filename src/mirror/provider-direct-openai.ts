import type {
  MirrorBrainChatRequest,
  MirrorBrainChatResponse,
} from "../mirror/provider/brain_chat_adapter.js";

export type OpenAICompatibleChatParams = {
  baseUrl: string;
  chatPath: string;
  apiKey: string;
  request: MirrorBrainChatRequest;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

export type OpenAICompatibleChatResult = {
  response: MirrorBrainChatResponse;
  latencyMs: number;
  endpoint: string;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeChatPath(value: string): string {
  if (!value.trim()) {
    return "/v1/chat/completions";
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBrainChatResponse(value: unknown): value is MirrorBrainChatResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.object === "string" &&
    typeof value.created === "number" &&
    typeof value.model === "string" &&
    Array.isArray(value.choices)
  );
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim().length > 0
    ) {
      return payload.error.message;
    }
  } catch {
    // Fall through to generic response status.
  }
  return `HTTP ${response.status} ${response.statusText}`.trim();
}

export async function runOpenAIChatCompletion(
  params: OpenAICompatibleChatParams,
): Promise<OpenAICompatibleChatResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const endpoint = `${normalizeBaseUrl(params.baseUrl)}${normalizeChatPath(params.chatPath)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`direct provider request timed out after ${params.timeoutMs}ms`));
  }, params.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.request.model,
        messages: params.request.messages,
        temperature: params.request.temperature,
        max_tokens: params.request.max_tokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const payload = (await response.json()) as unknown;
    if (!isBrainChatResponse(payload)) {
      throw new Error("provider returned invalid chat completion payload");
    }

    return {
      response: payload,
      latencyMs: Date.now() - startedAt,
      endpoint,
    };
  } finally {
    clearTimeout(timeout);
  }
}
