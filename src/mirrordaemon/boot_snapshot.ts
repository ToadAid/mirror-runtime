import type { MirrorServiceConfig } from "../mirror-service/config.js";
import type { MirrorServiceLifecycle } from "../mirror-service/lifecycle.js";
import { resolveMirrorWorkspaceUsersRoot } from "../mirror-user-workspace/index.js";
import type { MirrordaemonBootSnapshot, MirrordaemonSurfaceName } from "./daemon_types.js";

export function createBootSnapshot(params: {
  config: MirrorServiceConfig;
  lifecycle: MirrorServiceLifecycle;
  surfaces?: MirrordaemonSurfaceName[];
  runtimeStartedAt?: string;
}): MirrordaemonBootSnapshot {
  const runtimeStartedAt = params.runtimeStartedAt ?? new Date().toISOString();
  const workspaceUsersRoot = resolveMirrorWorkspaceUsersRoot();
  const surfaces = params.surfaces ?? [
    "cli",
    "service",
    "gateway",
    "console",
    "sync",
    "observability",
    "runtime_api",
  ];

  return {
    runtime_started_at: runtimeStartedAt,
    config: {
      node_id: params.config.nodeId,
      port: params.config.port,
      base_url: params.config.baseUrl,
      lore_dir: params.config.loreDir,
      provider_url: params.config.providerUrl,
      operator_auth_configured: Boolean(params.config.operatorToken),
      workspace_users_root: workspaceUsersRoot,
    },
    enabled_surfaces: surfaces,
    readiness: {
      lore: {
        ready: params.lifecycle.discoveredLoreFiles >= 0,
        discovered_files: params.lifecycle.discoveredLoreFiles,
      },
      workspace: {
        ready: true,
        users_root: workspaceUsersRoot,
      },
      sync: {
        ready: true,
        node_id: params.config.nodeId,
      },
      provider: {
        ready:
          params.config.providerUrl.trim().length > 0 &&
          params.config.providerAuthToken.trim().length > 0,
        configured:
          params.config.providerUrl.trim().length > 0 &&
          params.config.providerAuthToken.trim().length > 0,
      },
      observability: {
        ready: true,
      },
    },
  };
}
