/**
 * Compatibility-only OpenClaw runtime health endpoint.
 *
 * Canonical Mirror service health lives under `/mirror/health`.
 */

import type { MirrorRuntimeHost } from "../../../mirror-service/index.js";
import { getMirrordaemonRuntimeState } from "../../../mirrordaemon/index.js";

interface HealthResponse {
  ok: boolean;
  time: string;
  mode: "lan" | "intranet";
  version: string;
  commit: string;
  features: string[];
  brain: {
    configured: boolean;
  };
  auth: {
    configured: boolean;
  };
}

function hasConfiguredValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function handleHealthEndpoint(
  runtimeHost: MirrorRuntimeHost,
): Promise<HealthResponse> {
  const mode = process.env.MIRROR_RUNTIME_MODE || "lan";
  const runtime = getMirrordaemonRuntimeState(runtimeHost.daemon, {
    port: runtimeHost.config.port,
    baseUrl: runtimeHost.syncManager.getLocalBaseUrl(),
  });
  const commit = process.env.MIRROR_RUNTIME_COMMIT || "unknown";
  const brainConfigured = hasConfiguredValue(runtimeHost.config.providerUrl);
  const authConfigured = hasConfiguredValue(runtimeHost.config.providerAuthToken);
  const features: string[] = [];
  if (brainConfigured) {
    features.push("brain");
  }
  if (authConfigured) {
    features.push("auth");
  }

  return {
    ok: true,
    time: new Date().toISOString(),
    mode: mode as "lan" | "intranet",
    version: runtime.version,
    commit,
    features,
    brain: {
      configured: brainConfigured,
    },
    auth: {
      configured: authConfigured,
    },
  };
}
