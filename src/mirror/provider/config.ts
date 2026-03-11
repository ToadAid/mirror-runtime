import {
  createMirrorBrainChatProvider,
  type MirrorBrainChatTransport,
} from "./brain_chat_adapter.js";
import type { MirrorProvider } from "./types.js";

export type MirrorProviderConfig = {
  provider: "brain-chat";
  model: string;
};

type ProviderConfigError = Error & { code: string; retryable?: boolean };

function createProviderConfigError(code: string, message: string): ProviderConfigError {
  const error = new Error(message) as ProviderConfigError;
  error.code = code;
  return error;
}

function normalizeProvider(raw: string | undefined): string {
  if (typeof raw !== "string") {
    return "brain-chat";
  }
  const value = raw.trim().toLowerCase();
  if (!value) {
    return "brain-chat";
  }
  if (value === "brain-chat" || value === "mirror.brain-chat" || value === "brain_chat") {
    return "brain-chat";
  }
  return value;
}

export function resolveMirrorProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
  fallbackModel = "gpt-4o-mini",
): MirrorProviderConfig {
  const providerValue = normalizeProvider(env.MIRROR_PROVIDER);
  if (providerValue !== "brain-chat") {
    throw createProviderConfigError(
      "E_PROVIDER_CONFIG",
      `unsupported MIRROR_PROVIDER: ${providerValue}`,
    );
  }
  const configuredModel = env.MIRROR_PROVIDER_MODEL?.trim();
  return {
    provider: "brain-chat",
    model: configuredModel && configuredModel.length > 0 ? configuredModel : fallbackModel,
  };
}

export function createConfiguredMirrorProvider(params: {
  brainChatTransport: MirrorBrainChatTransport;
  env?: NodeJS.ProcessEnv;
  fallbackModel?: string;
}): MirrorProvider {
  const config = resolveMirrorProviderConfig(params.env ?? process.env, params.fallbackModel);
  return createMirrorBrainChatProvider({
    name: "mirror.brain-chat",
    defaultModel: config.model,
    transport: params.brainChatTransport,
  });
}
