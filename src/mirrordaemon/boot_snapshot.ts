import { resolveMirrorWorkspaceLayout } from "../mirror-local/paths.js";
import type { MirrorProviderPlane } from "../mirror-provider/index.js";
import type { MirrorServiceConfig } from "../mirror-service/config.js";
import type { MirrorServiceLifecycle } from "../mirror-service/lifecycle.js";
import type { MirrordaemonBootSnapshot, MirrordaemonSurfaceName } from "./daemon_types.js";

export function createBootSnapshot(params: {
  config: MirrorServiceConfig;
  lifecycle: MirrorServiceLifecycle;
  providerPlane?: MirrorProviderPlane;
  surfaces?: MirrordaemonSurfaceName[];
  runtimeStartedAt?: string;
  daemonSessionId: string;
}): MirrordaemonBootSnapshot {
  const runtimeStartedAt = params.runtimeStartedAt ?? new Date().toISOString();
  const workspace = resolveMirrorWorkspaceLayout();
  const workspaceUsersRoot = workspace.users_root;
  const providerStatuses = params.providerPlane?.listProviders() ?? [
    {
      provider_id: "primary",
      label: "Primary Provider",
      kind: "openai_compatible",
      url: params.config.providerUrl,
      enabled: true,
      configured:
        params.config.providerUrl.trim().length > 0 &&
        params.config.providerAuthToken.trim().length > 0,
      ready:
        params.config.providerUrl.trim().length > 0 &&
        params.config.providerAuthToken.trim().length > 0,
      selected: true,
      priority: 100,
      failure_count: 0,
    },
  ];
  const activeProvider = params.providerPlane?.getActiveProvider() ?? providerStatuses[0];
  const availableProviders = providerStatuses.filter(
    (provider) => provider.configured && provider.ready,
  );
  const surfaces = params.surfaces ?? [
    "cli",
    "service",
    "gateway",
    "console",
    "sync",
    "observability",
    "runtime_api",
    "runtime_ws",
  ];

  return {
    runtime_started_at: runtimeStartedAt,
    config: {
      daemon_session_id: params.daemonSessionId,
      node_id: params.config.nodeId,
      port: params.config.port,
      base_url: params.config.baseUrl,
      lore_dir: params.config.loreDir,
      provider_url: params.config.providerUrl,
      active_provider_id: activeProvider?.provider_id ?? null,
      provider_count: providerStatuses.length,
      operator_auth_configured: Boolean(params.config.operatorToken),
      workspace_users_root: workspaceUsersRoot,
      workspace_root: workspace.workspace_root,
    },
    enabled_surfaces: surfaces,
    readiness: {
      lore: {
        ready: params.lifecycle.discoveredLoreFiles >= 0,
        discovered_files: params.lifecycle.discoveredLoreFiles,
      },
      workspace: {
        ready: true,
        root: workspace.workspace_root,
        users_root: workspaceUsersRoot,
      },
      sync: {
        ready: true,
        node_id: params.config.nodeId,
      },
      provider: {
        ready: availableProviders.length > 0,
        configured: providerStatuses.some((provider) => provider.configured),
        active_provider_id: activeProvider?.provider_id ?? null,
        total: providerStatuses.length,
        available: availableProviders.length,
        fallback_available: availableProviders.length > 1,
      },
      observability: {
        ready: true,
      },
    },
  };
}
