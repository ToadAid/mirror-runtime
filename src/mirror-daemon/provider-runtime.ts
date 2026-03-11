import { completeBrainChatDirect } from "../mirror/provider-direct.js";
import {
  resolveMirrorProviderConfig,
  type MirrorBrainChatRequest,
  type MirrorBrainChatResponse,
} from "../mirror/provider/index.js";
import type { RuntimeEnv } from "../runtime.js";
import {
  completeBrainChatViaMirrorProvider,
  summarizeMirrorRunViaProvider,
  type MirrorProviderBridgeFailure,
  type MirrorProviderBridgeSuccess,
  type MirrorProviderCredentialsResolver,
  type MirrorRunProviderSummary,
  type MirrorRunProviderSummaryFailure,
} from "../runtime/mirror-provider-bridge.js";

export type MirrorProviderAuthSource = "configured_token" | "resolved_credentials" | "none";

export type MirrorProviderResolutionEvidence = {
  effective_provider: string;
  effective_model: string;
  alias_normalized_from?: string;
  auth_source: MirrorProviderAuthSource;
  credential_resolution_attempted: boolean;
  credential_resolution_ok?: boolean;
  last_error?: string;
};

export type MirrorProviderResolvedConfig = {
  provider: string;
  model: string;
  aliasNormalizedFrom?: string;
};

export type MirrorProviderCredentialResolution = {
  authToken?: string;
  evidence: MirrorProviderResolutionEvidence;
};

export type MirrorProviderInvocationSummary = {
  last_invoked_at: string;
  last_provider: string;
  last_model: string;
  last_outcome: "ok" | "error";
  last_error?: string;
};

export type MirrorProviderRecentInvocation = {
  invoked_at: string;
  provider: string;
  model: string;
  outcome: "ok" | "error";
  error?: string;
};

export type MirrorDaemonProviderOperatorSnapshot = {
  effective_provider: string;
  effective_model: string;
  alias_normalized_from?: string;
  auth_source: MirrorProviderAuthSource;
  credential_resolution_attempted: boolean;
  credential_resolution_ok?: boolean;
  last_error?: string;
  invocation_summary: MirrorProviderInvocationSummary | null;
  recent_invocations: MirrorProviderRecentInvocation[];
};

export type MirrorDaemonProviderStatus = {
  provider: string;
  default_model: string;
  source: {
    runtime_snapshot: boolean;
  };
  provider_env: {
    MIRROR_PROVIDER: string;
    MIRROR_PROVIDER_MODEL: string;
  };
  adapter: "brain-chat";
  invocation_summary: MirrorProviderInvocationSummary | null;
  recent_invocations: MirrorProviderRecentInvocation[];
  evidence: MirrorProviderResolutionEvidence;
};

export type MirrorDaemonProviderHealth = {
  provider: string;
  model: string;
  configured: boolean;
  reachable: boolean;
  ok: boolean;
  error?: string;
  source: {
    runtime_snapshot: boolean;
  };
  invocation_summary: MirrorProviderInvocationSummary | null;
  recent_invocations: MirrorProviderRecentInvocation[];
  evidence: MirrorProviderResolutionEvidence;
};

export type MirrorDaemonProviderRuntime = {
  providerEnv: NodeJS.ProcessEnv;
  resolveCredentials: MirrorProviderCredentialsResolver;
  resolveProviderConfig: () => MirrorProviderResolvedConfig;
  resolveCredentialResolution: (
    config: MirrorProviderResolvedConfig,
  ) => Promise<MirrorProviderCredentialResolution>;
  recordInvocationSuccess: (params: { provider: string; model: string }) => void;
  recordInvocationFailure: (params: { provider: string; model: string; error: string }) => void;
  getInvocationSummary: () => MirrorProviderInvocationSummary | null;
  getRecentInvocations: () => MirrorProviderRecentInvocation[];
  getOperatorSnapshot: (params?: {
    lastError?: string;
  }) => Promise<MirrorDaemonProviderOperatorSnapshot>;
  getProviderStatus: (params?: {
    runtimeSnapshot?: boolean;
  }) => Promise<MirrorDaemonProviderStatus>;
  probeProviderHealth: (params?: {
    runtimeSnapshot?: boolean;
  }) => Promise<MirrorDaemonProviderHealth>;
  executeBrainChat: (params: {
    request: MirrorBrainChatRequest;
    transport?: (request: MirrorBrainChatRequest) => Promise<MirrorBrainChatResponse>;
  }) => Promise<MirrorProviderBridgeSuccess | MirrorProviderBridgeFailure>;
  summarizeRunViaProvider: (params: {
    summary: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
    transport?: (request: MirrorBrainChatRequest) => Promise<MirrorBrainChatResponse>;
  }) => Promise<MirrorRunProviderSummary | MirrorRunProviderSummaryFailure>;
};

function resolveProviderMode(providerEnv: NodeJS.ProcessEnv): "bridge" | "direct" {
  return providerEnv.MIRROR_PROVIDER_MODE === "direct" ? "direct" : "bridge";
}

const MIRROR_BRAIN_URL_CONFIG_HINT =
  "brainUrl not configured; set MIRROR_BRAIN_URL, .mirror/config.json brain.url, or --brain-url";
const MIRROR_BRAIN_AUTH_TOKEN_CONFIG_HINT =
  "authToken not configured; set MIRROR_BRAIN_AUTH_TOKEN, .mirror/config.json brain.authToken, or --auth-token";

function sanitizeInvocationError(message: string): string {
  return message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeProviderError(message: string, authToken: string | undefined): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "provider probe failed";
  }
  if (authToken && authToken.length > 0) {
    return trimmed.split(authToken).join("[redacted]");
  }
  return trimmed;
}

function buildOperatorSnapshotEvidence(
  snapshot: MirrorDaemonProviderOperatorSnapshot,
): MirrorProviderResolutionEvidence {
  return {
    effective_provider: snapshot.effective_provider,
    effective_model: snapshot.effective_model,
    alias_normalized_from: snapshot.alias_normalized_from,
    auth_source: snapshot.auth_source,
    credential_resolution_attempted: snapshot.credential_resolution_attempted,
    credential_resolution_ok: snapshot.credential_resolution_ok,
    last_error: snapshot.last_error,
  };
}

function buildFallbackOperatorSnapshot(
  runtime: Pick<MirrorDaemonProviderRuntime, "getInvocationSummary" | "getRecentInvocations">,
  params?: {
    lastError?: string;
  },
): MirrorDaemonProviderOperatorSnapshot {
  return {
    effective_provider: "brain-chat",
    effective_model: "gpt-4o-mini",
    auth_source: "none",
    credential_resolution_attempted: false,
    credential_resolution_ok: false,
    last_error: params?.lastError,
    invocation_summary: runtime.getInvocationSummary(),
    recent_invocations: runtime.getRecentInvocations(),
  };
}

function buildRuntimeConfigError(
  code: string,
  message: string,
): MirrorProviderBridgeFailure | MirrorRunProviderSummaryFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      provider: "mirror.brain-chat",
    },
  };
}

export function createMirrorDaemonProviderRuntime(params: {
  env?: RuntimeEnv;
  brainUrl?: string;
  providerEnv: NodeJS.ProcessEnv;
  authToken?: string;
  resolveProviderCredentials: MirrorProviderCredentialsResolver;
}): MirrorDaemonProviderRuntime {
  const maxRecentInvocations = 10;
  let invocationSummary: MirrorProviderInvocationSummary | null = null;
  const recentInvocations: MirrorProviderRecentInvocation[] = [];

  function appendRecentInvocation(entry: MirrorProviderRecentInvocation): void {
    recentInvocations.push(entry);
    if (recentInvocations.length > maxRecentInvocations) {
      recentInvocations.splice(0, recentInvocations.length - maxRecentInvocations);
    }
  }

  async function resolveOperatorState(
    runtime: Pick<
      MirrorDaemonProviderRuntime,
      | "resolveProviderConfig"
      | "resolveCredentialResolution"
      | "getInvocationSummary"
      | "getRecentInvocations"
    >,
    options?: {
      lastError?: string;
    },
  ): Promise<{
    authToken?: string;
    snapshot: MirrorDaemonProviderOperatorSnapshot;
  }> {
    const resolvedConfig = runtime.resolveProviderConfig();
    const credentialResolution = await runtime.resolveCredentialResolution(resolvedConfig);
    return {
      authToken: credentialResolution.authToken,
      snapshot: {
        effective_provider: credentialResolution.evidence.effective_provider,
        effective_model: credentialResolution.evidence.effective_model,
        alias_normalized_from: credentialResolution.evidence.alias_normalized_from,
        auth_source: credentialResolution.evidence.auth_source,
        credential_resolution_attempted:
          credentialResolution.evidence.credential_resolution_attempted,
        credential_resolution_ok: credentialResolution.evidence.credential_resolution_ok,
        last_error: options?.lastError ?? credentialResolution.evidence.last_error,
        invocation_summary: runtime.getInvocationSummary(),
        recent_invocations: runtime.getRecentInvocations(),
      },
    };
  }

  return {
    providerEnv: params.providerEnv,
    resolveCredentials: params.resolveProviderCredentials,
    resolveProviderConfig() {
      const rawProvider =
        typeof params.providerEnv.MIRROR_PROVIDER === "string"
          ? params.providerEnv.MIRROR_PROVIDER
          : undefined;
      const defaultModel =
        (typeof params.providerEnv.MIRROR_PROVIDER_MODEL === "string"
          ? params.providerEnv.MIRROR_PROVIDER_MODEL
          : undefined) ?? "gpt-4o-mini";
      const config = resolveMirrorProviderConfig(params.providerEnv, defaultModel);
      const aliasNormalizedFrom =
        typeof rawProvider === "string" &&
        rawProvider.trim().length > 0 &&
        rawProvider.trim() !== config.provider
          ? rawProvider.trim()
          : undefined;
      return {
        provider: config.provider,
        model: config.model,
        aliasNormalizedFrom,
      };
    },
    async resolveCredentialResolution(config) {
      if (params.authToken && params.authToken.trim().length > 0) {
        return {
          authToken: params.authToken,
          evidence: {
            effective_provider: config.provider,
            effective_model: config.model,
            alias_normalized_from: config.aliasNormalizedFrom,
            auth_source: "configured_token",
            credential_resolution_attempted: false,
          },
        };
      }

      try {
        const resolved = await params.resolveProviderCredentials({ provider: config.provider });
        return {
          authToken: resolved.apiKey,
          evidence: {
            effective_provider: config.provider,
            effective_model: config.model,
            alias_normalized_from: config.aliasNormalizedFrom,
            auth_source: "resolved_credentials",
            credential_resolution_attempted: true,
            credential_resolution_ok: true,
          },
        };
      } catch {
        return {
          evidence: {
            effective_provider: config.provider,
            effective_model: config.model,
            alias_normalized_from: config.aliasNormalizedFrom,
            auth_source: "none",
            credential_resolution_attempted: true,
            credential_resolution_ok: false,
            last_error: "provider credentials unavailable",
          },
        };
      }
    },
    recordInvocationSuccess({ provider, model }) {
      const invokedAt = new Date().toISOString();
      invocationSummary = {
        last_invoked_at: invokedAt,
        last_provider: provider,
        last_model: model,
        last_outcome: "ok",
      };
      appendRecentInvocation({
        invoked_at: invokedAt,
        provider,
        model,
        outcome: "ok",
      });
    },
    recordInvocationFailure({ provider, model, error }) {
      const invokedAt = new Date().toISOString();
      const sanitizedError = sanitizeInvocationError(error);
      invocationSummary = {
        last_invoked_at: invokedAt,
        last_provider: provider,
        last_model: model,
        last_outcome: "error",
        last_error: sanitizedError,
      };
      appendRecentInvocation({
        invoked_at: invokedAt,
        provider,
        model,
        outcome: "error",
        error: sanitizedError,
      });
    },
    getInvocationSummary() {
      return invocationSummary ? { ...invocationSummary } : null;
    },
    getRecentInvocations() {
      return recentInvocations.map((entry) => ({ ...entry })).toReversed();
    },
    async getOperatorSnapshot(options) {
      const operatorState = await resolveOperatorState(this, options);
      return operatorState.snapshot;
    },
    async getProviderStatus(options) {
      const snapshot = await this.getOperatorSnapshot();
      return {
        provider: snapshot.effective_provider,
        default_model: snapshot.effective_model,
        source: {
          runtime_snapshot: options?.runtimeSnapshot === true,
        },
        provider_env: {
          MIRROR_PROVIDER: snapshot.effective_provider,
          MIRROR_PROVIDER_MODEL: snapshot.effective_model,
        },
        adapter: "brain-chat",
        invocation_summary: snapshot.invocation_summary,
        recent_invocations: snapshot.recent_invocations,
        evidence: buildOperatorSnapshotEvidence(snapshot),
      };
    },
    async probeProviderHealth(options) {
      let snapshot: MirrorDaemonProviderOperatorSnapshot | null = null;
      try {
        snapshot = await this.getOperatorSnapshot();
        const operatorState = await resolveOperatorState(this);
        const resolvedAuthToken = operatorState.authToken;
        const configured = Boolean(params.brainUrl);

        if (!configured) {
          return {
            provider: snapshot.effective_provider,
            model: snapshot.effective_model,
            configured: false,
            reachable: false,
            ok: false,
            error: "provider transport is not configured",
            source: {
              runtime_snapshot: options?.runtimeSnapshot === true,
            },
            invocation_summary: snapshot.invocation_summary,
            recent_invocations: snapshot.recent_invocations,
            evidence: buildOperatorSnapshotEvidence(snapshot),
          };
        }

        if (!resolvedAuthToken || resolvedAuthToken.trim().length === 0) {
          return {
            provider: snapshot.effective_provider,
            model: snapshot.effective_model,
            configured: true,
            reachable: false,
            ok: false,
            error: snapshot.last_error ?? "provider credentials unavailable",
            source: {
              runtime_snapshot: options?.runtimeSnapshot === true,
            },
            invocation_summary: snapshot.invocation_summary,
            recent_invocations: snapshot.recent_invocations,
            evidence: buildOperatorSnapshotEvidence(snapshot),
          };
        }

        const result = await completeBrainChatViaMirrorProvider({
          env: params.env!,
          brainUrl: params.brainUrl!,
          authToken: resolvedAuthToken,
          providerEnv: this.providerEnv,
          request: {
            model: snapshot.effective_model,
            messages: [{ role: "user", content: "mirror-provider-health-ping" }],
            temperature: 0,
            max_tokens: 1,
          },
          resolveCredentials: this.resolveCredentials,
          invocationRecorder: this,
        });

        if (result.ok) {
          const successSnapshot = await this.getOperatorSnapshot();
          return {
            provider: result.completion.provider,
            model: result.completion.model,
            configured: true,
            reachable: true,
            ok: true,
            source: {
              runtime_snapshot: options?.runtimeSnapshot === true,
            },
            invocation_summary: successSnapshot.invocation_summary,
            recent_invocations: successSnapshot.recent_invocations,
            evidence: buildOperatorSnapshotEvidence(successSnapshot),
          };
        }

        const error = sanitizeProviderError(result.error.message, resolvedAuthToken);
        const failureSnapshot = (
          await resolveOperatorState(this, {
            lastError: error,
          })
        ).snapshot;
        return {
          provider: snapshot.effective_provider,
          model: snapshot.effective_model,
          configured: true,
          reachable: false,
          ok: false,
          error,
          source: {
            runtime_snapshot: options?.runtimeSnapshot === true,
          },
          invocation_summary: failureSnapshot.invocation_summary,
          recent_invocations: failureSnapshot.recent_invocations,
          evidence: buildOperatorSnapshotEvidence(failureSnapshot),
        };
      } catch (error) {
        const fallbackSnapshot = snapshot ?? buildFallbackOperatorSnapshot(this);
        const sanitizedError = sanitizeProviderError(String(error), undefined);
        return {
          provider: fallbackSnapshot.effective_provider,
          model: fallbackSnapshot.effective_model,
          configured: true,
          reachable: false,
          ok: false,
          error: sanitizedError,
          source: {
            runtime_snapshot: options?.runtimeSnapshot === true,
          },
          invocation_summary: fallbackSnapshot.invocation_summary,
          recent_invocations: fallbackSnapshot.recent_invocations,
          evidence: buildOperatorSnapshotEvidence({
            ...fallbackSnapshot,
            last_error: fallbackSnapshot.last_error ?? sanitizedError,
          }),
        };
      }
    },
    async executeBrainChat({ request, transport }) {
      const providerMode = resolveProviderMode(this.providerEnv);
      params.env?.log?.(`[mirror-provider] mode=${providerMode}`);
      if (providerMode === "direct") {
        return await completeBrainChatDirect({
          env: params.env!,
          providerEnv: this.providerEnv,
          request,
          transport,
          resolveCredentials: this.resolveCredentials,
          invocationRecorder: this,
        });
      }
      if (!params.brainUrl) {
        this.recordInvocationFailure({
          provider: "mirror.brain-chat",
          model:
            typeof request.model === "string" && request.model.trim().length > 0
              ? request.model
              : "gpt-4o-mini",
          error: MIRROR_BRAIN_URL_CONFIG_HINT,
        });
        return buildRuntimeConfigError("E_BRAIN_URL_NOT_CONFIGURED", MIRROR_BRAIN_URL_CONFIG_HINT);
      }
      if (!params.authToken || params.authToken.trim().length === 0) {
        this.recordInvocationFailure({
          provider: "mirror.brain-chat",
          model:
            typeof request.model === "string" && request.model.trim().length > 0
              ? request.model
              : "gpt-4o-mini",
          error: MIRROR_BRAIN_AUTH_TOKEN_CONFIG_HINT,
        });
        return buildRuntimeConfigError(
          "E_BRAIN_AUTH_TOKEN_NOT_CONFIGURED",
          MIRROR_BRAIN_AUTH_TOKEN_CONFIG_HINT,
        );
      }
      return await completeBrainChatViaMirrorProvider({
        env: params.env!,
        brainUrl: params.brainUrl,
        authToken: params.authToken,
        providerEnv: this.providerEnv,
        request,
        transport,
        resolveCredentials: this.resolveCredentials,
        invocationRecorder: this,
      });
    },
    async summarizeRunViaProvider({ summary, events, transport }) {
      if (!params.brainUrl) {
        this.recordInvocationFailure({
          provider: "mirror.brain-chat",
          model: "gpt-4o-mini",
          error: "brain provider not configured",
        });
        return buildRuntimeConfigError(
          "E_PROVIDER_NOT_CONFIGURED",
          "brain provider not configured",
        );
      }
      return await summarizeMirrorRunViaProvider({
        env: params.env!,
        brainUrl: params.brainUrl,
        authToken: params.authToken,
        providerEnv: this.providerEnv,
        summary,
        events,
        transport,
        resolveCredentials: this.resolveCredentials,
        invocationRecorder: this,
      });
    },
  };
}
