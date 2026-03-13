import type {
  MirrorDiagnosticEvent,
  MirrorObservabilityContext,
} from "../mirror-observability/index.js";

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
  payload: Record<string, unknown>;
};

export type MirrordaemonRuntimeSummary = {
  ok: true;
  product: "mirror";
  runtime_started_at: string;
  node_id: string;
  port: number;
  base_url: string | null;
  surfaces: MirrordaemonSurfaceName[];
  readiness: MirrordaemonBootSnapshot["readiness"];
  sessions: {
    open: number;
    total: number;
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
  sessions: MirrordaemonSession[];
  diagnostics: MirrorDiagnosticEvent[];
  recent_events: MirrordaemonRuntimeEvent[];
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
