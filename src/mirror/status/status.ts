import type { MirrorMetricsSnapshot } from "../../mirror-observability/index.js";
import type { MirrorRuntimeHost } from "../../mirror-service/index.js";
import { getMirrorWorkspaceSummary } from "../../mirror-user-workspace/workspace_summary.js";
import {
  getMirrordaemonHealthState,
  getMirrordaemonRuntimeState,
} from "../../mirrordaemon/index.js";

export type MirrorStatus = {
  ts: string;
  cwd: string;
  runtime: ReturnType<typeof getMirrordaemonRuntimeState>;
  service: {
    lore_dir: string;
    provider_url: string;
    operator_auth_configured: boolean;
    workspace_root: string;
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
    root: string;
    users_root: string;
    summary: Awaited<ReturnType<typeof getMirrorWorkspaceSummary>>;
  };
  sync: {
    node_id: string;
    base_url: string | null;
    peers_known: number;
  };
  observability: {
    metrics: MirrorMetricsSnapshot;
    diagnostics_events: number;
  };
};

export type GetMirrorStatusOptions = {
  runtimeHost: MirrorRuntimeHost;
  cwd?: string;
  now?: Date;
};

export async function getMirrorStatus(opts: GetMirrorStatusOptions): Promise<MirrorStatus> {
  const now = opts.now ?? new Date();
  const cwd = opts.cwd ?? process.cwd();
  const daemon = opts.runtimeHost.daemon;
  const boot = daemon.getBootSnapshot();
  const observability = daemon.getObservability();
  const metrics = observability.getMetrics();
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
  const workspaceSummary = await getMirrorWorkspaceSummary();

  return {
    ts: now.toISOString(),
    cwd,
    runtime,
    service: {
      lore_dir: boot.config.lore_dir,
      provider_url: boot.config.provider_url,
      operator_auth_configured: boot.config.operator_auth_configured,
      workspace_root: boot.config.workspace_root,
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
      root: boot.readiness.workspace.root,
      users_root: boot.readiness.workspace.users_root,
      summary: workspaceSummary,
    },
    sync: {
      node_id: boot.readiness.sync.node_id,
      base_url: health.service.base_url,
      peers_known: health.sync.peers_known,
    },
    observability: {
      metrics,
      diagnostics_events: observability.getDiagnostics().events.length,
    },
  };
}
