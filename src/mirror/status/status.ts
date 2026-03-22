import type { MirrorRuntimeHost } from "../../mirror-service/index.js";
import {
  getMirrordaemonHealthState,
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
  const boot = daemon.getBootSnapshot();
  const metrics = daemon.getObservability().getMetrics();
  const peersKnown = metrics.gauges.peers_known || opts.runtimeHost.syncManager.listPeers().length;
  const baseUrl = opts.runtimeHost.syncManager.getLocalBaseUrl();
  const runtime = getMirrordaemonRuntimeState(daemon, {
    port: opts.runtimeHost.config.port,
    baseUrl,
  });
  const health = getMirrordaemonHealthState(daemon, {
    port: opts.runtimeHost.config.port,
    baseUrl,
    peersKnown,
  });

  return {
    runtime,
    service: {
      lore_dir: boot.config.lore_dir,
      provider_url: boot.config.provider_url,
      operator_auth_configured: boot.config.operator_auth_configured,
      workspace_users_root: boot.config.workspace_users_root,
    },
    provider: {
      configured: health.provider.configured,
      ready: health.provider.ready,
      active_provider_id: health.provider.active_provider_id,
      total: health.provider.total,
      available: health.provider.available,
      fallback_available: health.provider.fallback_available,
      providers: opts.runtimeHost.providerPlane.listProviders().map((provider) => ({
        provider_id: provider.provider_id,
        label: provider.label,
        url: provider.url,
        ready: provider.ready,
        selected: provider.selected,
        last_error: provider.last_error,
      })),
    },
    lore: {
      ready: boot.readiness.lore.ready,
      discovered_files: boot.readiness.lore.discovered_files,
      dir: boot.config.lore_dir,
    },
    workspace: {
      ready: boot.readiness.workspace.ready,
      users_root: boot.readiness.workspace.users_root,
    },
    sync: {
      node_id: boot.readiness.sync.node_id,
      base_url: health.service.base_url,
      peers_known: health.sync.peers_known,
    },
  };
}
