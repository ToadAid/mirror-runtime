import { getMirrorDiagnostics, getMirrorMetrics } from "../mirror-observability/index.js";
import type {
  MirrordaemonDebugSnapshot,
  MirrordaemonHealthSummary,
  MirrordaemonRuntimeSummary,
} from "./daemon_types.js";
import type { Mirrordaemon } from "./mirrordaemon.js";

export function buildRuntimeSummary(
  daemon: Mirrordaemon,
  overrides: { port?: number; baseUrl?: string | null } = {},
): MirrordaemonRuntimeSummary {
  const boot = daemon.getBootSnapshot();
  const sessions = daemon.listSessions();
  const openSessions = sessions.filter((session) => session.status === "open");

  return {
    ok: true,
    product: "mirror",
    runtime_started_at: boot.runtime_started_at,
    node_id: boot.config.node_id,
    port: overrides.port ?? boot.config.port,
    base_url: overrides.baseUrl ?? boot.config.base_url,
    surfaces: [...boot.enabled_surfaces],
    readiness: boot.readiness,
    sessions: {
      open: openSessions.length,
      total: sessions.length,
    },
  };
}

export function buildHealthSummary(
  daemon: Mirrordaemon,
  overrides: { port?: number; baseUrl?: string | null; peersKnown?: number } = {},
): MirrordaemonHealthSummary {
  const runtime = buildRuntimeSummary(daemon, overrides);
  const boot = daemon.getBootSnapshot();

  return {
    ...runtime,
    service: {
      node_id: boot.config.node_id,
      port: overrides.port ?? boot.config.port,
      base_url: overrides.baseUrl ?? boot.config.base_url,
      lore_dir: boot.config.lore_dir,
      provider_url: boot.config.provider_url,
      operator_auth_configured: boot.config.operator_auth_configured,
    },
    provider: {
      configured: boot.readiness.provider.configured,
    },
    sync: {
      peers_known: overrides.peersKnown ?? 0,
    },
    observability: {
      metrics_available: true,
      diagnostics_available: true,
    },
  };
}

export function buildDebugSnapshot(
  daemon: Mirrordaemon,
  overrides: { port?: number; baseUrl?: string | null; peersKnown?: number } = {},
): MirrordaemonDebugSnapshot {
  return {
    runtime: buildRuntimeSummary(daemon, overrides),
    boot_snapshot: daemon.getBootSnapshot(),
    sessions: daemon.listSessions(),
    diagnostics: getMirrorDiagnostics().events,
    recent_events: daemon.getRecentEvents(),
  };
}

export function buildStatusPayload() {
  return {
    metrics: getMirrorMetrics(),
    diagnostics: getMirrorDiagnostics(),
  };
}
