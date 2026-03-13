import type { MirrorProviderConfig } from "./provider_request.js";

export function buildMirrorProviderHeaders(config: MirrorProviderConfig): Record<string, string> {
  if (!config.authToken) {
    throw new Error("authToken not configured");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.authToken}`,
  };
}
