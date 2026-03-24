import {
  getCurrentMirrorObservabilityContext,
  type MirrorObservabilityContext,
} from "../mirror-observability/index.js";
import { withMirrorCorrelation, type MirrorRuntimeCorrelation } from "../mirror-runtime/index.js";
import { buildMirrorProviderHeaders } from "./provider_auth.js";
import type { MirrorProviderConfig, MirrorProviderRequest } from "./provider_request.js";
import type { MirrorProviderResponse } from "./provider_response.js";

export type FetchLike = typeof fetch;
export type MirrorProviderObservability = Pick<
  MirrorObservabilityContext,
  "recordLatency" | "logEvent"
>;

export async function executeMirrorProviderRequest(
  request: MirrorProviderRequest,
  config: MirrorProviderConfig,
  deps: {
    fetchImpl?: FetchLike;
    observability?: MirrorProviderObservability;
    onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
    correlation?: Partial<MirrorRuntimeCorrelation>;
  } = {},
): Promise<MirrorProviderResponse> {
  if (!config.url) {
    throw new Error("provider url not configured");
  }

  const startedAt = Date.now();
  deps.onRuntimeEvent?.(
    "provider.call.started",
    withMirrorCorrelation(
      {
        url: config.url,
        model: request.model,
      },
      deps.correlation,
    ),
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);
  const observability = deps.observability ?? getCurrentMirrorObservabilityContext();

  try {
    const response = await (deps.fetchImpl ?? fetch)(config.url, {
      method: "POST",
      headers: buildMirrorProviderHeaders(config),
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`brain proxy error: ${response.status} ${error}`);
    }

    const payload = (await response.json()) as MirrorProviderResponse;
    const durationMs = Date.now() - startedAt;
    observability.recordLatency("provider_latency_ms", durationMs);
    deps.onRuntimeEvent?.(
      "provider.call.finished",
      withMirrorCorrelation(
        {
          url: config.url,
          model: request.model,
          latency_ms: durationMs,
        },
        deps.correlation,
      ),
    );
    observability.logEvent("provider.call", {
      url: config.url,
      latency_ms: durationMs,
    });
    return payload;
  } catch (error) {
    deps.onRuntimeEvent?.(
      "provider.call.failed",
      withMirrorCorrelation(
        {
          url: config.url,
          model: request.model,
          error: String(error),
        },
        deps.correlation,
      ),
    );
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
