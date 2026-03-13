import { resolveDefaultLoreRoot } from "../mirror/lore_sources/index.js";

export type MirrorServiceConfig = {
  port: number;
  providerUrl: string;
  providerAuthToken: string;
  operatorToken: string | null;
  loreDir: string;
  nodeId: string;
  baseUrl: string | null;
};

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`Invalid MIRROR_PORT: ${value}`);
  }
  return parsed;
}

export function loadMirrorServiceConfig(
  overrides: Partial<MirrorServiceConfig> = {},
): MirrorServiceConfig {
  const port = overrides.port ?? parsePort(process.env.MIRROR_PORT, 7777);
  const providerUrl = overrides.providerUrl ?? process.env.MIRROR_PROVIDER_URL ?? "";
  const providerAuthToken =
    overrides.providerAuthToken ?? process.env.MIRROR_PROVIDER_AUTH_TOKEN ?? "";
  const operatorToken =
    overrides.operatorToken ??
    (typeof process.env.MIRROR_OPERATOR_TOKEN === "string"
      ? process.env.MIRROR_OPERATOR_TOKEN
      : null);
  const loreDir = overrides.loreDir ?? resolveDefaultLoreRoot(process.env.MIRROR_LORE_DIR);
  const nodeId = overrides.nodeId ?? process.env.MIRROR_NODE_ID ?? "mirror-node-local";
  const baseUrl =
    overrides.baseUrl ??
    (typeof process.env.MIRROR_BASE_URL === "string" &&
    process.env.MIRROR_BASE_URL.trim().length > 0
      ? process.env.MIRROR_BASE_URL.trim()
      : null);

  if (!providerUrl) {
    throw new Error("MIRROR_PROVIDER_URL is required");
  }
  if (!providerAuthToken) {
    throw new Error("MIRROR_PROVIDER_AUTH_TOKEN is required");
  }

  return {
    port,
    providerUrl,
    providerAuthToken,
    operatorToken,
    loreDir,
    nodeId,
    baseUrl,
  };
}
