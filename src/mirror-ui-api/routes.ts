import express from "express";
import {
  MIRROR_RUNTIME_WS_PATH,
  MIRROR_RUNTIME_WS_PROTOCOL,
} from "../mirror-service/runtime_events_ws.js";
import { buildMirrorPassport } from "../mirror/passport/passport.js";
import type {
  Mirrordaemon,
  MirrordaemonHealthSummary,
  MirrordaemonRuntimeSummary,
} from "../mirrordaemon/index.js";
import {
  MIRROR_UI_API_VERSION,
  type MirrorUiAgentDirectoryData,
  type MirrorUiDiscoveryData,
  type MirrorUiEnvelope,
  type MirrorUiForgeIdentityData,
  type MirrorUiRuntimeEventsDiscoveryData,
  type MirrorUiRuntimeStatusData,
} from "./contracts.js";

export type MirrorUiApiHandlers = {
  discovery: (req: express.Request, res: express.Response) => void;
  forgeIdentity: (req: express.Request, res: express.Response) => void;
  agents: (req: express.Request, res: express.Response) => void;
  runtimeStatus: (req: express.Request, res: express.Response) => void;
  runtimeEvents: (req: express.Request, res: express.Response) => void;
};

function respond<TKind extends string, TData>(
  res: express.Response,
  kind: TKind,
  data: TData,
): void {
  const envelope: MirrorUiEnvelope<TKind, TData> = {
    ok: true,
    api: MIRROR_UI_API_VERSION,
    kind,
    data,
  };
  res.json(envelope);
}

function toBaseUrl(req: express.Request, fallbackBaseUrl: string | null): string | null {
  if (fallbackBaseUrl) {
    return fallbackBaseUrl;
  }
  const host = typeof req.get === "function" ? req.get("host") : undefined;
  if (!host) {
    return null;
  }
  const protocol =
    typeof req.protocol === "string" && req.protocol.length > 0 ? req.protocol : "http";
  return `${protocol}://${host}`;
}

function toAbsoluteUrl(baseUrl: string | null, path: string): string {
  if (!baseUrl) {
    return path;
  }
  return new URL(path, baseUrl).toString();
}

export function createMirrorUiApiHandlers(params: {
  daemon: Mirrordaemon;
  getRuntime: () => MirrordaemonRuntimeSummary;
  getHealth: () => MirrordaemonHealthSummary;
  getBaseUrl: () => string | null;
}): MirrorUiApiHandlers {
  return {
    discovery(req, res) {
      const baseUrl = toBaseUrl(req, params.getBaseUrl());
      const data: MirrorUiDiscoveryData = {
        forge_identity: toAbsoluteUrl(baseUrl, "/mirror/ui/forge/identity"),
        agents: toAbsoluteUrl(baseUrl, "/mirror/ui/agents"),
        runtime_status: toAbsoluteUrl(baseUrl, "/mirror/ui/runtime/status"),
        runtime_events: toAbsoluteUrl(baseUrl, "/mirror/ui/runtime/events"),
      };
      respond(res, "ui.discovery", data);
    },
    forgeIdentity(req, res) {
      const health = params.getHealth();
      const passport = buildMirrorPassport({
        includeLocal: true,
      });
      const data: MirrorUiForgeIdentityData = {
        passport,
        runtime: {
          node_id: health.node_id,
          runtime_started_at: health.runtime_started_at,
          base_url: health.base_url,
          operator_auth_configured: health.service.operator_auth_configured,
        },
      };
      respond(res, "forge.identity", data);
    },
    agents(req, res) {
      const runtime = params.getRuntime();
      const passport = buildMirrorPassport();
      const baseUrl = toBaseUrl(req, params.getBaseUrl());
      const requestedAgentId =
        typeof req.query.agent_id === "string" ? req.query.agent_id.trim() : "";
      const agents = [
        {
          agent_id: passport.agentIdentity.agentId,
          label: passport.agentIdentity.agentId,
          source: "local_runtime" as const,
          node_id: runtime.node_id,
          runtime_started_at: runtime.runtime_started_at,
          sessions: runtime.sessions,
          links: {
            forge_identity: toAbsoluteUrl(baseUrl, "/mirror/ui/forge/identity"),
            runtime_status: toAbsoluteUrl(baseUrl, "/mirror/ui/runtime/status"),
            runtime_events: toAbsoluteUrl(baseUrl, "/mirror/ui/runtime/events"),
          },
        },
      ].filter((entry) => requestedAgentId.length === 0 || entry.agent_id === requestedAgentId);
      const data: MirrorUiAgentDirectoryData = {
        agents,
      };
      respond(res, "agent.directory", data);
    },
    runtimeStatus(_req, res) {
      const data: MirrorUiRuntimeStatusData = {
        runtime: params.getRuntime(),
        health: params.getHealth(),
      };
      respond(res, "runtime.status", data);
    },
    runtimeEvents(req, res) {
      const baseUrl = toBaseUrl(req, params.getBaseUrl());
      const wsBase =
        baseUrl && baseUrl.startsWith("https://")
          ? baseUrl.replace(/^https:\/\//, "wss://")
          : baseUrl && baseUrl.startsWith("http://")
            ? baseUrl.replace(/^http:\/\//, "ws://")
            : null;
      const data: MirrorUiRuntimeEventsDiscoveryData = {
        stream: "runtime.events",
        sse: {
          url: toAbsoluteUrl(baseUrl, "/mirror/runtime/events"),
          event_source: true,
          backlog: "implicit",
        },
        websocket: {
          url: toAbsoluteUrl(wsBase, MIRROR_RUNTIME_WS_PATH),
          protocol: MIRROR_RUNTIME_WS_PROTOCOL,
          backlog_query: "backlog",
          client_messages: ["ping", "subscribe"],
          server_messages: ["hello", "subscribed", "runtime.event", "pong", "error"],
        },
      };
      respond(res, "runtime.events.discovery", data);
    },
  };
}

export function createMirrorUiApiRouter(
  handlers: MirrorUiApiHandlers,
  basePath = "/mirror/ui",
): express.Router {
  const router = express.Router();
  router.get(basePath, handlers.discovery);
  router.get(`${basePath}/forge/identity`, handlers.forgeIdentity);
  router.get(`${basePath}/agents`, handlers.agents);
  router.get(`${basePath}/runtime/status`, handlers.runtimeStatus);
  router.get(`${basePath}/runtime/events`, handlers.runtimeEvents);
  return router;
}
