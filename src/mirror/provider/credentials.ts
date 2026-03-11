import { resolveApiKeyForProvider } from "../../agents/model-auth.js";
import { normalizeProviderId } from "../../agents/model-selection.js";

export type MirrorProviderCredentials = {
  provider: string;
  apiKey: string;
  source: string;
  mode: "api-key" | "oauth" | "token";
  profileId?: string;
};

export type MirrorProviderCredentialResolver = (params: {
  provider: string;
  profileId?: string;
  preferredProfile?: string;
  cfg?: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"];
  agentDir?: string;
}) => Promise<{
  apiKey?: string;
  source: string;
  mode: Awaited<ReturnType<typeof resolveApiKeyForProvider>>["mode"];
  profileId?: string;
}>;

export type MirrorProviderAuthTokenResolver = (params: {
  provider: string;
}) => Promise<{ apiKey: string }>;

type MirrorProviderCredentialResolverError = Error & { code: string; retryable?: boolean };

function createCredentialResolverError(
  code: string,
  message: string,
): MirrorProviderCredentialResolverError {
  const error = new Error(message) as MirrorProviderCredentialResolverError;
  error.code = code;
  return error;
}

function normalizeProvider(value: string): string {
  const normalized = normalizeProviderId(value);
  if (normalized === "mirror.brain-chat" || normalized === "brain_chat") {
    return "brain-chat";
  }
  return normalized;
}

export function createMirrorProviderCredentialResolver(
  resolver: typeof resolveApiKeyForProvider = resolveApiKeyForProvider,
): MirrorProviderCredentialResolver {
  return async (params) =>
    await resolver({
      provider: params.provider,
      cfg: params.cfg,
      profileId: params.profileId,
      preferredProfile: params.preferredProfile,
      agentDir: params.agentDir,
    });
}

export async function resolveMirrorProviderCredentials(params: {
  provider: string;
  profileId?: string;
  preferredProfile?: string;
  cfg?: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"];
  agentDir?: string;
  resolver?: typeof resolveApiKeyForProvider;
  resolveCredentials?: MirrorProviderCredentialResolver;
}): Promise<MirrorProviderCredentials> {
  const provider = normalizeProvider(params.provider);
  const resolveCredentials =
    params.resolveCredentials ?? createMirrorProviderCredentialResolver(params.resolver);

  let resolved: Awaited<ReturnType<MirrorProviderCredentialResolver>>;
  try {
    resolved = await resolveCredentials({
      provider,
      cfg: params.cfg,
      profileId: params.profileId,
      preferredProfile: params.preferredProfile,
      agentDir: params.agentDir,
    });
  } catch {
    throw createCredentialResolverError(
      "E_PROVIDER_CREDENTIALS",
      "provider credentials unavailable",
    );
  }

  if (
    typeof resolved.apiKey !== "string" ||
    resolved.apiKey.trim().length === 0 ||
    resolved.mode === "aws-sdk"
  ) {
    throw createCredentialResolverError(
      "E_PROVIDER_CREDENTIALS",
      "provider credentials unavailable",
    );
  }

  return {
    provider,
    apiKey: resolved.apiKey,
    source: resolved.source,
    mode: resolved.mode,
    profileId: resolved.profileId,
  };
}
