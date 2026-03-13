import { logMirrorEvent, recordLatency } from "../mirror-observability/index.js";
import { buildMirrorProviderHeaders } from "./provider_auth.js";
import type { MirrorProviderConfig, MirrorProviderRequest } from "./provider_request.js";
import type { MirrorProviderResponse } from "./provider_response.js";

export type FetchLike = typeof fetch;

export async function executeMirrorProviderRequest(
  request: MirrorProviderRequest,
  config: MirrorProviderConfig,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<MirrorProviderResponse> {
  if (!config.url) {
    throw new Error("provider url not configured");
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

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
    recordLatency("provider_latency_ms", durationMs);
    logMirrorEvent("provider.call", {
      url: config.url,
      latency_ms: durationMs,
    });
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}
