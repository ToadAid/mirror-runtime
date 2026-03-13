import type { MirrorServiceConfig } from "../mirror-service/config.js";
import type { FetchLike } from "./mirror_provider.js";
import { executeMirrorProviderRequest } from "./mirror_provider.js";
import type { MirrorProviderConfig, MirrorProviderRequest } from "./provider_request.js";
import type { MirrorProviderResponse } from "./provider_response.js";

export type MirrorProviderKind = "openai_compatible";

export type MirrorProviderDescriptor = {
  provider_id: string;
  label: string;
  kind: MirrorProviderKind;
  url: string;
  authToken: string;
  timeoutMs?: number;
  enabled?: boolean;
  priority?: number;
};

export type MirrorProviderStatus = {
  provider_id: string;
  label: string;
  kind: MirrorProviderKind;
  url: string;
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  selected: boolean;
  priority: number;
  last_error?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_latency_ms?: number;
  failure_count: number;
};

export type MirrorProviderSelectionInput = {
  preferredProviderId?: string;
  allowFallback?: boolean;
};

export type MirrorProviderSelection = {
  provider: MirrorProviderStatus;
  attempted_provider_ids: string[];
  fallback_used: boolean;
};

export type MirrorProviderExecutionResult = {
  provider: MirrorProviderStatus;
  selection: MirrorProviderSelection;
  response: MirrorProviderResponse;
};

export type MirrorProviderPlane = {
  listProviders: () => MirrorProviderStatus[];
  getProvider: (providerId: string) => MirrorProviderStatus | undefined;
  getActiveProvider: () => MirrorProviderStatus | undefined;
  selectProvider: (input?: MirrorProviderSelectionInput) => MirrorProviderSelection;
  execute: (
    request: MirrorProviderRequest,
    deps?: {
      fetchImpl?: FetchLike;
      onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
      selection?: MirrorProviderSelectionInput;
    },
  ) => Promise<MirrorProviderExecutionResult>;
};

type ProviderEntry = {
  descriptor: MirrorProviderDescriptor;
  state: {
    last_error?: string;
    last_success_at?: string;
    last_failure_at?: string;
    last_latency_ms?: number;
    failure_count: number;
  };
};

function normalizeProviderDescriptor(
  descriptor: MirrorProviderDescriptor,
  index: number,
): MirrorProviderDescriptor {
  return {
    provider_id: descriptor.provider_id,
    label: descriptor.label,
    kind: descriptor.kind,
    url: descriptor.url,
    authToken: descriptor.authToken,
    timeoutMs: descriptor.timeoutMs,
    enabled: descriptor.enabled ?? true,
    priority: descriptor.priority ?? 100 - index,
  };
}

function isConfigured(entry: ProviderEntry): boolean {
  return (
    entry.descriptor.url.trim().length > 0 &&
    entry.descriptor.authToken.trim().length > 0 &&
    entry.descriptor.enabled !== false
  );
}

function toProviderConfig(descriptor: MirrorProviderDescriptor): MirrorProviderConfig {
  return {
    url: descriptor.url,
    authToken: descriptor.authToken,
    timeoutMs: descriptor.timeoutMs,
  };
}

function toProviderStatus(entry: ProviderEntry, selectedProviderId?: string): MirrorProviderStatus {
  const configured = isConfigured(entry);
  return {
    provider_id: entry.descriptor.provider_id,
    label: entry.descriptor.label,
    kind: entry.descriptor.kind,
    url: entry.descriptor.url,
    enabled: entry.descriptor.enabled !== false,
    configured,
    ready: configured && !entry.state.last_error,
    selected: selectedProviderId === entry.descriptor.provider_id,
    priority: entry.descriptor.priority ?? 0,
    last_error: entry.state.last_error,
    last_success_at: entry.state.last_success_at,
    last_failure_at: entry.state.last_failure_at,
    last_latency_ms: entry.state.last_latency_ms,
    failure_count: entry.state.failure_count,
  };
}

function createNoProviderError(): Error {
  return new Error("Mirror provider plane has no configured provider");
}

export function buildPrimaryProviderDescriptorFromConfig(
  config: Pick<MirrorServiceConfig, "providerUrl" | "providerAuthToken">,
): MirrorProviderDescriptor {
  return {
    provider_id: "primary",
    label: "Primary Provider",
    kind: "openai_compatible",
    url: config.providerUrl,
    authToken: config.providerAuthToken,
    enabled: true,
    priority: 100,
  };
}

export function createMirrorProviderPlane(
  descriptors: MirrorProviderDescriptor[],
  options: { activeProviderId?: string } = {},
): MirrorProviderPlane {
  const entries = descriptors.map((descriptor, index) => ({
    descriptor: normalizeProviderDescriptor(descriptor, index),
    state: {
      failure_count: 0,
    },
  }));
  let activeProviderId = options.activeProviderId ?? entries[0]?.descriptor.provider_id ?? null;

  function orderedEntries(input?: MirrorProviderSelectionInput): ProviderEntry[] {
    const preferred = input?.preferredProviderId;
    const sorted = [...entries].toSorted(
      (left, right) => (right.descriptor.priority ?? 0) - (left.descriptor.priority ?? 0),
    );
    if (preferred) {
      const preferredEntry = sorted.find((entry) => entry.descriptor.provider_id === preferred);
      if (preferredEntry) {
        return [
          preferredEntry,
          ...sorted.filter((entry) => entry.descriptor.provider_id !== preferred),
        ];
      }
    }
    if (activeProviderId) {
      const activeEntry = sorted.find((entry) => entry.descriptor.provider_id === activeProviderId);
      if (activeEntry) {
        return [activeEntry, ...sorted.filter((entry) => entry !== activeEntry)];
      }
    }
    return sorted;
  }

  function allowedFallback(input?: MirrorProviderSelectionInput): boolean {
    return input?.allowFallback !== false;
  }

  return {
    listProviders() {
      return entries.map((entry) => toProviderStatus(entry, activeProviderId ?? undefined));
    },
    getProvider(providerId) {
      const entry = entries.find((candidate) => candidate.descriptor.provider_id === providerId);
      return entry ? toProviderStatus(entry, activeProviderId ?? undefined) : undefined;
    },
    getActiveProvider() {
      const activeEntry = activeProviderId
        ? entries.find((entry) => entry.descriptor.provider_id === activeProviderId)
        : entries[0];
      return activeEntry ? toProviderStatus(activeEntry, activeProviderId ?? undefined) : undefined;
    },
    selectProvider(input = {}) {
      const ordered = orderedEntries(input).filter((entry) => isConfigured(entry));
      const selected = ordered[0];
      if (!selected) {
        throw createNoProviderError();
      }
      return {
        provider: toProviderStatus(selected, selected.descriptor.provider_id),
        attempted_provider_ids: ordered.map((entry) => entry.descriptor.provider_id),
        fallback_used:
          Boolean(input.preferredProviderId) &&
          input.preferredProviderId !== selected.descriptor.provider_id,
      };
    },
    async execute(request, deps = {}) {
      const candidates = orderedEntries(deps.selection).filter((entry) => isConfigured(entry));
      if (candidates.length === 0) {
        throw createNoProviderError();
      }

      const allowFallback = allowedFallback(deps.selection);
      const attempted: string[] = [];
      let lastError: unknown;

      for (const [index, entry] of candidates.entries()) {
        attempted.push(entry.descriptor.provider_id);
        const startedAt = Date.now();
        deps.onRuntimeEvent?.("provider.selected", {
          provider_id: entry.descriptor.provider_id,
          url: entry.descriptor.url,
          fallback_candidate: index > 0,
        });
        try {
          const response = await executeMirrorProviderRequest(
            request,
            toProviderConfig(entry.descriptor),
            {
              fetchImpl: deps.fetchImpl,
              onRuntimeEvent: (type, payload) => {
                deps.onRuntimeEvent?.(type, {
                  provider_id: entry.descriptor.provider_id,
                  ...payload,
                });
              },
            },
          );
          const latency = Date.now() - startedAt;
          entry.state.last_error = undefined;
          entry.state.last_success_at = new Date().toISOString();
          entry.state.last_latency_ms = latency;
          activeProviderId = entry.descriptor.provider_id;
          return {
            provider: toProviderStatus(entry, activeProviderId),
            selection: {
              provider: toProviderStatus(entry, activeProviderId),
              attempted_provider_ids: attempted,
              fallback_used: index > 0,
            },
            response,
          };
        } catch (error) {
          entry.state.last_error = String(error);
          entry.state.last_failure_at = new Date().toISOString();
          entry.state.failure_count += 1;
          lastError = error;
          deps.onRuntimeEvent?.("provider.fallback", {
            provider_id: entry.descriptor.provider_id,
            fallback_available: allowFallback && index < candidates.length - 1,
            error: String(error),
          });
          if (!allowFallback || index === candidates.length - 1) {
            throw error;
          }
        }
      }

      throw lastError instanceof Error ? lastError : createNoProviderError();
    },
  };
}
