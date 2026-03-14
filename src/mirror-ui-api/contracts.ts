import type { MirrorPassport } from "../mirror/passport/types.js";
import type {
  MirrordaemonHealthSummary,
  MirrordaemonRuntimeSummary,
} from "../mirrordaemon/index.js";

export const MIRROR_UI_API_VERSION = "mirror.ui.v1";

export type MirrorUiEnvelope<TKind extends string, TData> = {
  ok: true;
  api: typeof MIRROR_UI_API_VERSION;
  kind: TKind;
  data: TData;
};

export type MirrorUiForgeIdentityData = {
  passport: MirrorPassport;
  runtime: {
    node_id: string;
    runtime_started_at: string;
    base_url: string | null;
    operator_auth_configured: boolean;
  };
};

export type MirrorUiAgentDirectoryEntry = {
  agent_id: string;
  label: string;
  source: "local_runtime";
  node_id: string;
  runtime_started_at: string;
  sessions: {
    open: number;
    total: number;
  };
  links: {
    forge_identity: string;
    runtime_status: string;
    runtime_events: string;
  };
};

export type MirrorUiAgentDirectoryData = {
  agents: MirrorUiAgentDirectoryEntry[];
};

export type MirrorUiRuntimeStatusData = {
  runtime: MirrordaemonRuntimeSummary;
  health: MirrordaemonHealthSummary;
};

export type MirrorUiRuntimeEventsDiscoveryData = {
  stream: "runtime.events";
  sse: {
    url: string;
    event_source: true;
    backlog: "implicit";
  };
  websocket: {
    url: string;
    protocol: string;
    backlog_query: "backlog";
    client_messages: ["ping", "subscribe"];
    server_messages: ["hello", "subscribed", "runtime.event", "pong", "error"];
  };
};

export type MirrorUiDiscoveryData = {
  forge_identity: string;
  agents: string;
  runtime_status: string;
  runtime_events: string;
};
