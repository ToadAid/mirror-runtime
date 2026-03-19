import type { MirrorActionRuntime } from "../mirror-actions/index.js";
import type { MirrorProviderPlane } from "../mirror-provider/index.js";
import { VERSION } from "../version.js";
import type {
  MirrordaemonActionsSummary,
  MirrordaemonActionStatus,
  MirrordaemonConnectorRuntimeStatus,
  MirrordaemonDebugSnapshot,
  MirrordaemonHealthSummary,
  MirrordaemonProvidersSummary,
  MirrordaemonRuntimeSummary,
} from "./daemon_types.js";
import type { Mirrordaemon } from "./mirrordaemon.js";

type RuntimeStateOverrides = {
  port?: number;
  baseUrl?: string | null;
  actionRuntime?: MirrorActionRuntime;
  providerPlane?: MirrorProviderPlane;
  wsConnections?: number;
  sseAvailable?: boolean;
  wsAvailable?: boolean;
  connectorRuntime?: {
    telegram?: MirrordaemonConnectorRuntimeStatus;
  };
};

function buildDefaultConnectorRuntimeStatus(): MirrordaemonConnectorRuntimeStatus {
  return {
    state: "disabled",
    enabled: false,
    configured: false,
    running: false,
    updated_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
    last_error_summary: null,
    last_successful_poll_at: null,
    updates_processed: 0,
    bot: null,
    detail: null,
  };
}

function buildCorrelationCapabilities() {
  return {
    trace_id: true as const,
    session_id: true as const,
    action_id: true as const,
    provider_id: true as const,
  };
}

function buildActiveActionStatuses(daemon: Mirrordaemon): MirrordaemonActionStatus[] {
  const activeActions = new Map<string, MirrordaemonActionStatus>();

  for (const event of daemon.getRecentEvents().toReversed()) {
    if (event.type === "action.execution.started") {
      const actionId = event.correlation?.action_id;
      const actionName =
        typeof event.payload.action === "string" ? event.payload.action : undefined;
      if (!actionId || !actionName || !event.correlation?.trace_id) {
        continue;
      }
      activeActions.set(actionId, {
        action_id: actionId,
        action_name: actionName,
        trace_id: event.correlation.trace_id,
        session_id: event.correlation.session_id,
        started_at: event.timestamp,
      });
      continue;
    }
    if (event.type === "action.execution.finished" || event.type === "action.execution.failed") {
      const actionId = event.correlation?.action_id;
      if (actionId) {
        activeActions.delete(actionId);
      }
    }
  }

  return [...activeActions.values()].toSorted((left, right) =>
    right.started_at.localeCompare(left.started_at),
  );
}

export function buildActionsSummary(
  daemon: Mirrordaemon,
  options: { actionRuntime?: MirrorActionRuntime } = {},
): MirrordaemonActionsSummary {
  const boot = daemon.getBootSnapshot();
  const activeActions = buildActiveActionStatuses(daemon);

  return {
    ok: true,
    daemon_session_id: boot.config.daemon_session_id,
    registered: options.actionRuntime?.listActions().length ?? 0,
    active: activeActions.length,
    actions: activeActions,
  };
}

export function buildProvidersSummary(
  daemon: Mirrordaemon,
  options: { providerPlane?: MirrorProviderPlane } = {},
): MirrordaemonProvidersSummary {
  const boot = daemon.getBootSnapshot();
  const providers =
    options.providerPlane?.listProviders().map((provider) => ({
      provider_id: provider.provider_id,
      label: provider.label,
      kind: provider.kind,
      ready: provider.ready,
      configured: provider.configured,
      selected: provider.selected,
    })) ?? [];

  return {
    ok: true,
    daemon_session_id: boot.config.daemon_session_id,
    active_provider_id: boot.readiness.provider.active_provider_id,
    total: boot.readiness.provider.total,
    available: boot.readiness.provider.available,
    fallback_available: boot.readiness.provider.fallback_available,
    providers,
  };
}

export function buildRuntimeSummary(
  daemon: Mirrordaemon,
  overrides: RuntimeStateOverrides = {},
): MirrordaemonRuntimeSummary {
  const boot = daemon.getBootSnapshot();
  const sessions = daemon.listSessions();
  const openSessions = sessions.filter((session) => session.status === "open");
  const activeActions = buildActiveActionStatuses(daemon);
  const uptimeMs = Math.max(0, Date.now() - Date.parse(boot.runtime_started_at));

  return {
    ok: true,
    product: "mirror",
    version: VERSION,
    daemon_session_id: boot.config.daemon_session_id,
    runtime_started_at: boot.runtime_started_at,
    uptime_ms: uptimeMs,
    node_id: boot.config.node_id,
    port: overrides.port ?? boot.config.port,
    base_url: overrides.baseUrl ?? boot.config.base_url,
    surfaces: [...boot.enabled_surfaces],
    readiness: boot.readiness,
    sessions: {
      open: openSessions.length,
      total: sessions.length,
    },
    actions: {
      active: activeActions.length,
      registered: overrides.actionRuntime?.listActions().length ?? 0,
    },
    providers: {
      active_provider_id: boot.readiness.provider.active_provider_id,
      total: boot.readiness.provider.total,
      available: boot.readiness.provider.available,
    },
    connectors: {
      telegram: overrides.connectorRuntime?.telegram ?? buildDefaultConnectorRuntimeStatus(),
    },
    event_stream: {
      sse_available: overrides.sseAvailable ?? true,
      ws_available: overrides.wsAvailable ?? true,
      ws_connections: overrides.wsConnections ?? 0,
      recent_events: daemon.getRecentEvents().length,
    },
    correlation: buildCorrelationCapabilities(),
  };
}

export function buildHealthSummary(
  daemon: Mirrordaemon,
  overrides: RuntimeStateOverrides & { peersKnown?: number } = {},
): MirrordaemonHealthSummary {
  const runtime = buildRuntimeSummary(daemon, overrides);
  const boot = daemon.getBootSnapshot();
  const metrics = daemon.getObservability().getMetrics();

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
      ready: boot.readiness.provider.ready,
      active_provider_id: boot.readiness.provider.active_provider_id,
      total: boot.readiness.provider.total,
      available: boot.readiness.provider.available,
      fallback_available: boot.readiness.provider.fallback_available,
    },
    sync: {
      peers_known: overrides.peersKnown ?? metrics.gauges.peers_known ?? 0,
    },
    connectors: {
      telegram: overrides.connectorRuntime?.telegram ?? buildDefaultConnectorRuntimeStatus(),
    },
    observability: {
      metrics_available: true,
      diagnostics_available: true,
    },
  };
}

export function buildDebugSnapshot(
  daemon: Mirrordaemon,
  overrides: RuntimeStateOverrides & { peersKnown?: number } = {},
): MirrordaemonDebugSnapshot {
  const observability = daemon.getObservability();
  return {
    runtime: buildRuntimeSummary(daemon, overrides),
    boot_snapshot: daemon.getBootSnapshot(),
    correlation: {
      fields: ["trace_id", "session_id", "action_id", "provider_id"],
    },
    sessions: daemon.listSessions(),
    diagnostics: observability.getDiagnostics().events,
    recent_events: daemon.getRecentEvents(),
  };
}

export function buildStatusPayload(daemon: Mirrordaemon) {
  return {
    metrics: daemon.getObservability().getMetrics(),
    diagnostics: daemon.getObservability().getDiagnostics(),
  };
}
