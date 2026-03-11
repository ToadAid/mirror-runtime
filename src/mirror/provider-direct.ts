import type { RuntimeEnv } from "../runtime.js";
import type {
  MirrorProviderBridgeFailure,
  MirrorProviderBridgeSuccess,
  MirrorProviderCredentialsResolver,
  MirrorProviderInvocationRecorder,
} from "../runtime/mirror-provider-bridge.js";
import { runOpenAIChatCompletion } from "./provider-direct-openai.js";
import type {
  MirrorBrainChatRequest,
  MirrorBrainChatResponse,
  MirrorProviderCompletion,
  MirrorProviderError,
} from "./provider/index.js";
import { normalizeMirrorProviderError } from "./provider/index.js";

export type MirrorDirectProviderParams = {
  env: RuntimeEnv;
  providerEnv?: NodeJS.ProcessEnv;
  request: MirrorBrainChatRequest;
  transport?: (request: MirrorBrainChatRequest) => Promise<MirrorBrainChatResponse>;
  resolveCredentials?: MirrorProviderCredentialsResolver;
  invocationRecorder?: MirrorProviderInvocationRecorder;
};

type ResolvedDirectProviderConfig = {
  mode: string;
  kind: string;
  baseUrl: string;
  chatPath: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
};

function asNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveTimeoutMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 90_000;
}

function resolveDirectProviderConfig(
  providerEnv: NodeJS.ProcessEnv | undefined,
  request: MirrorBrainChatRequest,
): ResolvedDirectProviderConfig {
  const env = providerEnv ?? process.env;
  return {
    mode: asNonEmptyString(env.MIRROR_PROVIDER_MODE) ?? "bridge",
    kind: asNonEmptyString(env.MIRROR_PROVIDER_KIND) ?? "openai_compat",
    baseUrl: asNonEmptyString(env.MIRROR_PROVIDER_BASE_URL) ?? "",
    chatPath: asNonEmptyString(env.MIRROR_PROVIDER_CHAT_PATH) ?? "/v1/chat/completions",
    apiKey: asNonEmptyString(env.MIRROR_PROVIDER_API_KEY),
    model:
      asNonEmptyString(request.model) ??
      asNonEmptyString(env.MIRROR_PROVIDER_MODEL) ??
      "gpt-4o-mini",
    timeoutMs: resolveTimeoutMs(env.MIRROR_PROVIDER_TIMEOUT_MS),
  };
}

async function resolveDirectProviderApiKey(params: {
  config: ResolvedDirectProviderConfig;
  resolveCredentials?: MirrorProviderCredentialsResolver;
}): Promise<string | undefined> {
  if (params.config.apiKey) {
    return params.config.apiKey;
  }
  if (!params.resolveCredentials) {
    return undefined;
  }
  try {
    const resolved = await params.resolveCredentials({ provider: params.config.kind });
    return asNonEmptyString(resolved.apiKey);
  } catch {
    return undefined;
  }
}

function buildCompletion(params: {
  response: MirrorBrainChatResponse;
  provider: string;
  model: string;
  latencyMs: number;
  endpoint: string;
}): MirrorProviderCompletion {
  const usage = params.response.usage
    ? {
        inputTokens: params.response.usage.prompt_tokens,
        outputTokens: params.response.usage.completion_tokens,
        totalTokens: params.response.usage.total_tokens,
      }
    : undefined;
  return {
    text: params.response.choices[0]?.message?.content ?? "",
    provider: params.provider,
    model: params.response.model || params.model,
    usage,
    raw: {
      content: params.response.choices[0]?.message?.content ?? "",
      usage,
      model: params.response.model || params.model,
      latency: params.latencyMs,
      endpoint: params.endpoint,
      response: params.response,
    },
  };
}

function buildError(error: unknown, provider: string): MirrorProviderBridgeFailure {
  const normalized: MirrorProviderError = normalizeMirrorProviderError(error, provider);
  return { ok: false, error: normalized };
}

export async function completeBrainChatDirect(
  params: MirrorDirectProviderParams,
): Promise<MirrorProviderBridgeSuccess | MirrorProviderBridgeFailure> {
  const config = resolveDirectProviderConfig(params.providerEnv, params.request);
  const providerName = `mirror.direct.${config.kind}`;

  if (!config.baseUrl) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model: config.model,
      error: "direct provider base URL not configured",
    });
    return buildError(
      {
        code: "E_PROVIDER_NOT_CONFIGURED",
        message: "direct provider base URL not configured; set MIRROR_PROVIDER_BASE_URL",
      },
      providerName,
    );
  }

  const apiKey = await resolveDirectProviderApiKey({
    config,
    resolveCredentials: params.resolveCredentials,
  });
  if (!apiKey) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model: config.model,
      error: "direct provider API key not configured",
    });
    return buildError(
      {
        code: "E_PROVIDER_CREDENTIALS",
        message: "direct provider API key not configured; set MIRROR_PROVIDER_API_KEY",
      },
      providerName,
    );
  }

  params.env.log?.(
    `[mirror-provider] mode=direct kind=${config.kind} model=${config.model} endpoint=${config.baseUrl}${config.chatPath}`,
  );

  try {
    const request = { ...params.request, model: config.model };
    const result = params.transport
      ? {
          response: await params.transport(request),
          latencyMs: 0,
          endpoint: `${config.baseUrl}${config.chatPath}`,
        }
      : config.kind === "openai_compat"
        ? await runOpenAIChatCompletion({
            baseUrl: config.baseUrl,
            chatPath: config.chatPath,
            apiKey,
            request,
            timeoutMs: config.timeoutMs,
          })
        : null;

    if (!result) {
      throw {
        code: "E_PROVIDER_NOT_SUPPORTED",
        message: `unsupported direct provider kind: ${config.kind}`,
      };
    }

    const completion = buildCompletion({
      response: result.response,
      provider: providerName,
      model: config.model,
      latencyMs: result.latencyMs,
      endpoint: result.endpoint,
    });

    params.env.log?.(
      `[mirror-provider] completion-success mode=direct kind=${config.kind} model=${completion.model} latency=${result.latencyMs}ms`,
    );
    params.invocationRecorder?.recordInvocationSuccess({
      provider: completion.provider,
      model: completion.model,
    });
    return {
      ok: true,
      completion,
      response: result.response,
    };
  } catch (error) {
    const normalized = normalizeMirrorProviderError(error, providerName);
    params.env.error?.(
      `[mirror-provider] completion-failure mode=direct kind=${config.kind} model=${config.model} endpoint=${config.baseUrl}${config.chatPath} error=${normalized.message}`,
    );
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model: config.model,
      error: normalized.message,
    });
    return { ok: false, error: normalized };
  }
}
