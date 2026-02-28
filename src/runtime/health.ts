/**
 * Runtime Health Endpoint
 *
 * /health — Local-only status check. NO network calls.
 *
 * Security properties:
 * - No external requests (brain, auth, network)
 * - Deterministic signature for cacheability
 * - Returns only locally configured state
 */

import type { RuntimeEnv } from "../../runtime.js";

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

export async function handleHealthEndpoint(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
): Promise<HealthResponse> {
  // No network calls. All state is local.
  const mode = process.env.MIRROR_RUNTIME_MODE || "lan";
  const version = process.env.MIRROR_RUNTIME_VERSION || "unknown";
  const commit = process.env.MIRROR_RUNTIME_COMMIT || "unknown";
  const features: string[] = [];
  if (brainUrl) {
    features.push("brain");
  }
  if (authToken) {
    features.push("auth");
  }

  return {
    ok: true,
    time: new Date().toISOString(),
    mode: mode as "lan" | "intranet",
    version,
    commit,
    features,
    brain: {
      configured: !!brainUrl,
    },
    auth: {
      configured: !!authToken,
    },
  };
}
