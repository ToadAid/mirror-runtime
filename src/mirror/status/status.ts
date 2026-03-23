import type { MirrorRuntimeHost } from "../../mirror-service/index.js";
import {
  getMirrordaemonHealthState,
  getMirrordaemonProvidersState,
  getMirrordaemonRuntimeState,
} from "../../mirrordaemon/index.js";

export type MirrorStatus = {
  runtime: ReturnType<typeof getMirrordaemonRuntimeState>;
  service: {
    lore_dir: string;
    provider_url: string;
    operator_auth_configured: boolean;
    workspace_users_root: string;
  };
  provider: {
    configured: boolean;
    ready: boolean;
    active_provider_id: string | null;
    total: number;
    available: number;
    fallback_available: boolean;
    providers: Array<{
      provider_id: string;
      label: string;
      url: string;
      ready: boolean;
      selected: boolean;
      last_error?: string;
    }>;
  };
  lore: {
    ready: boolean;
    discovered_files: number;
    dir: string;
  };
  workspace: {
    ready: boolean;
    users_root: string;
  };
  sync: {
    node_id: string;
    base_url: string | null;
    peers_known: number;
  };
};

export type GetMirrorStatusOptions = {
  runtimeHost: MirrorRuntimeHost;
};

export async function getMirrorStatus(opts: GetMirrorStatusOptions): Promise<MirrorStatus> {
  const daemon = opts.runtimeHost.daemon;
  const peers = opts.runtimeHost.syncManager.listPeers();
  const baseUrl = opts.runtimeHost.syncManager.getLocalBaseUrl();
  const runtime = getMirrordaemonRuntimeState(daemon, {
    port: opts.runtimeHost.config.port,
    baseUrl,
  });
  const health = getMirrordaemonHealthState(daemon, {
    port: opts.runtimeHost.config.port,
    baseUrl,
    peers,
  });
  const providers = getMirrordaemonProvidersState(daemon, {
    providerPlane: opts.runtimeHost.providerPlane,
  });

  return {
    runtime,
    service: {
      lore_dir: health.service.lore_dir,
      provider_url: health.service.provider_url,
      operator_auth_configured: health.service.operator_auth_configured,
      workspace_users_root: runtime.readiness.workspace.users_root,
    },
    provider: {
      configured: health.provider.configured,
      ready: health.provider.ready,
      active_provider_id: providers.active_provider_id,
      total: providers.total,
      available: providers.available,
      fallback_available: providers.fallback_available,
      providers: providers.providers.map((provider) => ({
        provider_id: provider.provider_id,
        label: provider.label,
        url: provider.url,
        ready: provider.ready,
        selected: provider.selected,
        last_error: provider.last_error,
      })),
    },
    lore: {
      ready: runtime.readiness.lore.ready,
      discovered_files: runtime.readiness.lore.discovered_files,
      dir: health.service.lore_dir,
    },
    workspace: {
      ready: runtime.readiness.workspace.ready,
      users_root: runtime.readiness.workspace.users_root,
    },
    sync: {
      node_id: runtime.node_id,
      base_url: health.service.base_url,
      peers_known: health.sync.peers_known,
    },
  };
}
