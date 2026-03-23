import type {
  MirrorDiagnosticEvent,
  MirrorObservabilityContext,
} from "../mirror-observability/index.js";
import type { MirrorSyncPeer } from "../mirror-sync/index.js";

export type MirrordaemonSurfaceName =
  | "cli"
  | "service"
  | "gateway"
  | "console"
  | "sync"
  | "observability"
  | "runtime_api"
  | "runtime_ws";

export type MirrordaemonBootSnapshot = {
  runtime_started_at: string;
  config: {
    daemon_session_id: string;
    node_id: string;
    port: number;
    base_url: string | null;
    lore_dir: string;
    provider_url: string;
    active_provider_id: string | null;
    provider_count: number;
    operator_auth_configured: boolean;
    workspace_users_root: string;
  };
  enabled_surfaces: MirrordaemonSurfaceName[];
  readiness: {
    lore: {
      ready: boolean;
      discovered_files: number;
    };
    workspace: {
      ready: boolean;
      users_root: string;
    };
    sync: {
      ready: boolean;
      node_id: string;
    };
    provider: {
      ready: boolean;
      configured: boolean;
      active_provider_id: string | null;
      total: number;
      available: number;
      fallback_available: boolean;
    };
    observability: {
      ready: true;
    };
  };
};

export type MirrordaemonSession = {
  session_id: string;
  user_id?: string;
  created_at: string;
  last_activity_at: string;
  status: "open" | "closed";
  metadata: Record<string, unknown>;
};

export type CreateMirrordaemonSessionInput = {
  session_id?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  now?: string;
};

export type TouchMirrordaemonSessionInput = {
  user_id?: string;
  metadata?: Record<string, unknown>;
  now?: string;
};

export type MirrordaemonRuntimeEvent = {
  id: string;
  type: string;
  timestamp: string;
  correlation?: {
    trace_id: string;
    session_id?: string;
    action_id?: string;
    provider_id?: string;
  };
  payload: Record<string, unknown>;
};

export type MirrordaemonRuntimeSummary = {
  ok: true;
  product: "mirror";
  version: string;
  daemon_session_id: string;
  runtime_started_at: string;
  uptime_ms: number;
  node_id: string;
  port: number;
  base_url: string | null;
  surfaces: MirrordaemonSurfaceName[];
  readiness: MirrordaemonBootSnapshot["readiness"];
  sessions: {
    open: number;
    total: number;
  };
  actions: {
    active: number;
    registered: number;
  };
  providers: {
    active_provider_id: string | null;
    total: number;
    available: number;
  };
  event_stream: {
    sse_available: boolean;
    ws_available: boolean;
    ws_connections: number;
    recent_events: number;
  };
  correlation: {
    trace_id: true;
    session_id: true;
    action_id: true;
    provider_id: true;
  };
};

export type MirrordaemonHealthSummary = MirrordaemonRuntimeSummary & {
  service: {
    node_id: string;
    port: number;
    base_url: string | null;
    lore_dir: string;
    provider_url: string;
    operator_auth_configured: boolean;
  };
  provider: {
    configured: boolean;
    ready: boolean;
    active_provider_id: string | null;
    total: number;
    available: number;
    fallback_available: boolean;
  };
  sync: {
    peers_known: number;
  };
  observability: {
    metrics_available: true;
    diagnostics_available: true;
  };
};

export type MirrordaemonDebugSnapshot = {
  runtime: MirrordaemonRuntimeSummary;
  boot_snapshot: MirrordaemonBootSnapshot;
  correlation: {
    fields: ["trace_id", "session_id", "action_id", "provider_id"];
  };
  sessions: MirrordaemonSession[];
  diagnostics: MirrorDiagnosticEvent[];
  recent_events: MirrordaemonRuntimeEvent[];
};

export type MirrordaemonActionStatus = {
  action_id: string;
  action_name: string;
  trace_id: string;
  session_id?: string;
  started_at: string;
};

export type MirrordaemonActionsSummary = {
  ok: true;
  daemon_session_id: string;
  registered: number;
  active: number;
  actions: MirrordaemonActionStatus[];
};

export type MirrordaemonProvidersSummary = {
  ok: true;
  daemon_session_id: string;
  active_provider_id: string | null;
  total: number;
  available: number;
  fallback_available: boolean;
  providers: Array<{
    provider_id: string;
    label: string;
    kind: string;
    url: string;
    ready: boolean;
    configured: boolean;
    selected: boolean;
    last_error?: string;
  }>;
};

export type MirrordaemonSyncSummary = {
  ok: true;
  daemon_session_id: string;
  peers_known: number;
  peers: Array<
    Pick<
      MirrorSyncPeer,
      "peer_id" | "base_url" | "last_seen_at" | "sync_status" | "last_sync_at" | "last_error"
    >
  >;
};

export type MirrordaemonEventSubscription = {
  unsubscribe: () => void;
};

export type MirrordaemonEventStream = {
  publishRuntimeEvent: (
    type: string,
    payload?: Record<string, unknown>,
  ) => MirrordaemonRuntimeEvent;
  subscribeRuntimeEvents: (
    listener: (event: MirrordaemonRuntimeEvent) => void,
  ) => MirrordaemonEventSubscription;
  getRecentEvents: () => MirrordaemonRuntimeEvent[];
};

export type MirrordaemonObservability = {
  getObservability: () => MirrorObservabilityContext;
};
