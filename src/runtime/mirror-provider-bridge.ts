import type { MirrorProviderAuthTokenResolver } from "../mirror/provider/credentials.js";
import {
  createConfiguredMirrorProvider,
  normalizeMirrorProviderError,
  resolveMirrorProviderConfig,
  runMirrorProviderCompletion,
  type MirrorBrainChatRequest,
  type MirrorBrainChatResponse,
  type MirrorProviderCompletion,
  type MirrorProviderError,
} from "../mirror/provider/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { handleBrainChatEndpoint } from "./brain-chat.js";

export type MirrorProviderBridgeSuccess = {
  ok: true;
  completion: MirrorProviderCompletion;
  response: MirrorBrainChatResponse;
};

export type MirrorProviderBridgeFailure = {
  ok: false;
  error: MirrorProviderError;
};

export type MirrorRunProviderSummary = {
  ok: true;
  text: string;
  provider: string;
  model: string;
};

export type MirrorRunProviderSummaryFailure = {
  ok: false;
  error: MirrorProviderError;
};

export type MirrorProviderCredentialsResolver = MirrorProviderAuthTokenResolver;

export type MirrorProviderInvocationRecorder = {
  recordInvocationSuccess: (params: { provider: string; model: string }) => void;
  recordInvocationFailure: (params: { provider: string; model: string; error: string }) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBrainChatResponse(value: unknown): value is MirrorBrainChatResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.model === "string" &&
    Array.isArray(value.choices) &&
    value.choices.length > 0 &&
    isRecord(value.choices[0]) &&
    isRecord(value.choices[0].message) &&
    typeof value.choices[0].message.content === "string"
  );
}

function normalizeCredentialResolverError(error: unknown, provider: string): MirrorProviderError {
  const normalized = normalizeMirrorProviderError(error, provider);
  if (normalized.code === "E_PROVIDER_CREDENTIALS") {
    return {
      ...normalized,
      message: "provider credentials unavailable",
    };
  }
  return normalized;
}

async function resolveProviderAuthToken(params: {
  existingAuthToken: string | undefined;
  provider: string;
  resolveCredentials?: MirrorProviderCredentialsResolver;
  providerName: string;
}): Promise<{ ok: true; authToken: string } | { ok: false; error: MirrorProviderError }> {
  if (params.existingAuthToken) {
    return { ok: true, authToken: params.existingAuthToken };
  }

  const resolver = params.resolveCredentials;
  if (!resolver) {
    return {
      ok: false,
      error: normalizeCredentialResolverError(
        { code: "E_PROVIDER_CREDENTIALS", message: "provider credentials unavailable" },
        params.providerName,
      ),
    };
  }
  try {
    const resolved = await resolver({
      provider: params.provider,
    });
    return { ok: true, authToken: resolved.apiKey };
  } catch (error) {
    return {
      ok: false,
      error: normalizeCredentialResolverError(error, params.providerName),
    };
  }
}

function resolveEffectiveProviderConfig(params: {
  providerEnv?: NodeJS.ProcessEnv;
  requestedModel?: string;
  providerName: string;
}): { ok: true; provider: string; model: string } | { ok: false; error: MirrorProviderError } {
  try {
    const fallbackModel =
      typeof params.requestedModel === "string" && params.requestedModel.trim().length > 0
        ? params.requestedModel
        : "gpt-4o-mini";
    const config = resolveMirrorProviderConfig(params.providerEnv ?? process.env, fallbackModel);
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeMirrorProviderError(error, params.providerName),
    };
  }
}

function buildFallbackResponse(completion: MirrorProviderCompletion): MirrorBrainChatResponse {
  return {
    id: `mirror-provider-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: completion.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: completion.text },
        finish_reason: "stop",
      },
    ],
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.inputTokens ?? 0,
          completion_tokens: completion.usage.outputTokens ?? 0,
          total_tokens:
            completion.usage.totalTokens ??
            (completion.usage.inputTokens ?? 0) + (completion.usage.outputTokens ?? 0),
        }
      : undefined,
  };
}

export async function completeBrainChatViaMirrorProvider(params: {
  env: RuntimeEnv;
  brainUrl: string;
  authToken: string | undefined;
  providerEnv?: NodeJS.ProcessEnv;
  request: MirrorBrainChatRequest;
  transport?: (request: MirrorBrainChatRequest) => Promise<MirrorBrainChatResponse>;
  resolveCredentials?: MirrorProviderCredentialsResolver;
  invocationRecorder?: MirrorProviderInvocationRecorder;
}): Promise<MirrorProviderBridgeSuccess | MirrorProviderBridgeFailure> {
  const providerName = "mirror.brain-chat";
  const providerConfig = resolveEffectiveProviderConfig({
    providerEnv: params.providerEnv,
    requestedModel: params.request.model,
    providerName,
  });
  if (!providerConfig.ok) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model:
        typeof params.request.model === "string" && params.request.model.trim().length > 0
          ? params.request.model
          : "gpt-4o-mini",
      error: providerConfig.error.message,
    });
    return {
      ok: false,
      error: providerConfig.error,
    };
  }

  const authResolution = await resolveProviderAuthToken({
    existingAuthToken: params.authToken,
    provider: providerConfig.provider,
    resolveCredentials: params.resolveCredentials,
    providerName,
  });
  if (!authResolution.ok) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerConfig.provider,
      model: providerConfig.model,
      error: authResolution.error.message,
    });
    return {
      ok: false,
      error: authResolution.error,
    };
  }

  try {
    const provider = createConfiguredMirrorProvider({
      env: params.providerEnv,
      brainChatTransport:
        params.transport ??
        (async (request: MirrorBrainChatRequest) =>
          await handleBrainChatEndpoint(
            params.env,
            params.brainUrl,
            authResolution.authToken,
            request,
          )),
      fallbackModel: providerConfig.model,
    });
    const completion = await runMirrorProviderCompletion(
      provider,
      {
        prompt: params.request.messages.at(-1)?.content ?? "",
        messages: params.request.messages,
      },
      {
        model: params.request.model,
        temperature: params.request.temperature,
        maxTokens: params.request.max_tokens,
      },
    );

    const response = isBrainChatResponse(completion.raw)
      ? completion.raw
      : buildFallbackResponse(completion);
    params.invocationRecorder?.recordInvocationSuccess({
      provider: completion.provider,
      model: completion.model,
    });
    return { ok: true, completion, response };
  } catch (error) {
    const normalized = normalizeMirrorProviderError(error, providerName);
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerConfig.provider,
      model: providerConfig.model,
      error: normalized.message,
    });
    return {
      ok: false,
      error: normalized,
    };
  }
}

export async function summarizeMirrorRunViaProvider(params: {
  env: RuntimeEnv;
  brainUrl: string | undefined;
  authToken: string | undefined;
  providerEnv?: NodeJS.ProcessEnv;
  summary: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  transport?: (request: MirrorBrainChatRequest) => Promise<MirrorBrainChatResponse>;
  resolveCredentials?: MirrorProviderCredentialsResolver;
  invocationRecorder?: MirrorProviderInvocationRecorder;
}): Promise<MirrorRunProviderSummary | MirrorRunProviderSummaryFailure> {
  const providerName = "mirror.brain-chat";
  if (!params.brainUrl) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model: "gpt-4o-mini",
      error: "brain provider not configured",
    });
    return {
      ok: false,
      error: {
        code: "E_PROVIDER_NOT_CONFIGURED",
        message: "brain provider not configured",
        provider: providerName,
      },
    };
  }

  const providerConfig = resolveEffectiveProviderConfig({
    providerEnv: params.providerEnv,
    providerName,
  });
  if (!providerConfig.ok) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerName,
      model: "gpt-4o-mini",
      error: providerConfig.error.message,
    });
    return {
      ok: false,
      error: providerConfig.error,
    };
  }

  const authResolution = await resolveProviderAuthToken({
    existingAuthToken: params.authToken,
    provider: providerConfig.provider,
    resolveCredentials: params.resolveCredentials,
    providerName,
  });
  if (!authResolution.ok) {
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerConfig.provider,
      model: providerConfig.model,
      error: authResolution.error.message,
    });
    return {
      ok: false,
      error: authResolution.error,
    };
  }

  const compactEvents = params.events.slice(0, 12);
  const prompt = [
    "Summarize this runtime run for operator inspection.",
    "Use 2-4 short sentences and include failures if present.",
    `Summary: ${JSON.stringify(params.summary)}`,
    `Events: ${JSON.stringify(compactEvents)}`,
  ].join("\n");

  try {
    const provider = createConfiguredMirrorProvider({
      env: params.providerEnv,
      brainChatTransport:
        params.transport ??
        (async (request: MirrorBrainChatRequest) =>
          await handleBrainChatEndpoint(
            params.env,
            params.brainUrl!,
            authResolution.authToken,
            request,
          )),
      fallbackModel: providerConfig.model,
    });
    const completion = await runMirrorProviderCompletion(
      provider,
      { prompt, system: "You are a concise runtime operator assistant." },
      undefined,
    );
    params.invocationRecorder?.recordInvocationSuccess({
      provider: completion.provider,
      model: completion.model,
    });
    return {
      ok: true,
      text: completion.text,
      provider: completion.provider,
      model: completion.model,
    };
  } catch (error) {
    const normalized = normalizeMirrorProviderError(error, providerName);
    params.invocationRecorder?.recordInvocationFailure({
      provider: providerConfig.provider,
      model: providerConfig.model,
      error: normalized.message,
    });
    return {
      ok: false,
      error: normalized,
    };
  }
}
