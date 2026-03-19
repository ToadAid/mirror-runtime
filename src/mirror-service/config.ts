import { loadMirrorSettingsSync } from "../mirror-settings/index.js";
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

export function loadMirrorServiceConfig(
  overrides: Partial<MirrorServiceConfig> = {},
): MirrorServiceConfig {
  const settings = loadMirrorSettingsSync({
    overrides: {
      runtime: {
        port: overrides.port,
        node_id: overrides.nodeId,
        base_url: overrides.baseUrl,
      },
      provider: {
        url: overrides.providerUrl,
        token: overrides.providerAuthToken,
      },
      operator_token: overrides.operatorToken,
    },
  });
  const port = settings.runtime.port;
  const providerUrl = settings.provider.active?.url ?? "";
  const providerAuthToken = settings.provider.active?.auth_token ?? "";
  const operatorToken = settings.operator_token;
  const loreDir = overrides.loreDir ?? resolveDefaultLoreRoot(settings.workspace.lore_dir);
  const nodeId = settings.runtime.node_id;
  const baseUrl = settings.runtime.base_url;

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
