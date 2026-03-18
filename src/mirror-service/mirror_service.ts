import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import {
  createMirrorActionRuntime,
  createMirrorActionsFromTools,
} from "../mirror-actions/index.js";
import {
  createMirrorConsoleHandlers,
  createMirrorConsoleRouterAtBase,
  type MirrorConsoleHandlers,
} from "../mirror-console/index.js";
import { readMirrorRequestToken } from "../mirror-gateway/auth.js";
import {
  createMirrorGatewayHandlers,
  createMirrorGatewayRouter,
  type MirrorGatewayHandlers,
} from "../mirror-gateway/index.js";
import {
  createMirrorObservabilityHandlers,
  createMirrorObservabilityRouter,
  runWithMirrorObservabilityContext,
} from "../mirror-observability/index.js";
import {
  buildMirrorActionPolicyTarget,
  createMirrorPolicyEngine,
  type MirrorPolicyContext,
} from "../mirror-policy/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import { resolveMirrorTraceId } from "../mirror-runtime/index.js";
import {
  createMirrorSyncHandlers,
  createMirrorSyncManager,
  createMirrorSyncRouter,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import { createMirrorUiApiHandlers, createMirrorUiApiRouter } from "../mirror-ui-api/index.js";
import { createMirrorToolRegistry, getMirrorNativeSkillTools } from "../mirror/skills/index.js";
import {
  createMirrordaemon,
  getMirrordaemonActionsState,
  getMirrordaemonDebugState,
  getMirrordaemonHealthState,
  getMirrordaemonProvidersState,
  getMirrordaemonRuntimeState,
  type Mirrordaemon,
} from "../mirrordaemon/index.js";
import { loadMirrorServiceConfig, type MirrorServiceConfig } from "./config.js";
import { initializeMirrorServiceLifecycle, type MirrorServiceLifecycle } from "./lifecycle.js";
import {
  createMirrorRuntimeWebSocketServer,
  type MirrorRuntimeWebSocketServer,
} from "./runtime_events_ws.js";

export type MirrorService = {
  app: express.Application;
  server: http.Server;
  handlers: MirrorGatewayHandlers;
  consoleHandlers: MirrorConsoleHandlers;
  syncHandlers: ReturnType<typeof createMirrorSyncHandlers>;
  syncManager: MirrorSyncManager;
  providerPlane: MirrorProviderPlane;
  runtimeWebSocket: MirrorRuntimeWebSocketServer;
  daemon: Mirrordaemon;
  config: MirrorServiceConfig;
  lifecycle: MirrorServiceLifecycle;
  port: number;
  shutdown: () => Promise<void>;
};

export type MirrorHealthStatus = {
  ok: true;
  product: "mirror";
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

function shouldTrackMirrorSession(pathname: string): boolean {
  return (
    pathname.startsWith("/mirror/chat") ||
    pathname.startsWith("/mirror/tools") ||
    pathname.startsWith("/mirror/console/api/chat") ||
    pathname.startsWith("/mirror/console/api/tools")
  );
}

export async function startMirrorService(
  overrides: Partial<MirrorServiceConfig> = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<MirrorService> {
  const config = loadMirrorServiceConfig(overrides);
  const lifecycle = await initializeMirrorServiceLifecycle(config);
  const providerPlane = createMirrorProviderPlane([
    {
      ...buildPrimaryProviderDescriptorFromConfig(config),
    },
  ]);
  const daemon = createMirrordaemon({
    config,
    lifecycle,
    providerPlane,
  });
  const observability = daemon.getObservability();
  const policy = createMirrorPolicyEngine();
  const registry = createMirrorToolRegistry(getMirrorNativeSkillTools());
  const actionRuntime = createMirrorActionRuntime(
    createMirrorActionsFromTools(registry.listTools()),
  );

  const handlers = createMirrorGatewayHandlers(registry, {
    providerPlane,
    actionRuntime,
    fetchImpl: deps.fetchImpl,
    policy,
    onRuntimeEvent: daemon.publishRuntimeEvent,
  });
  const syncManager = createMirrorSyncManager({
    nodeId: config.nodeId,
    loreDir: config.loreDir,
    baseUrl: config.baseUrl,
    fetchImpl: deps.fetchImpl,
    onRuntimeEvent: daemon.publishRuntimeEvent,
  });
  const rawSyncHandlers = createMirrorSyncHandlers(syncManager);
  async function evaluateSyncPolicy(
    req: express.Request,
    actionName: "sync.announce" | "sync.updates" | "sync.pull" | "sync.peers",
  ): Promise<
    { allowed: true } | { allowed: false; statusCode: number; body: Record<string, unknown> }
  > {
    const header =
      typeof req.header === "function"
        ? (name: string) => req.header(name)
        : (_name: string) => undefined;
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const policyContext: MirrorPolicyContext = {
      surface: "sync",
      route: typeof req.path === "string" ? req.path : "",
      request_token: readMirrorRequestToken(req),
      session: {
        session_id: header("x-mirror-session-id") ?? undefined,
      },
      metadata: {
        method: typeof req.method === "string" ? req.method : "UNKNOWN",
      },
    };
    const decision = await policy.evaluate({
      phase: "action",
      target: buildMirrorActionPolicyTarget(actionName, body),
      context: policyContext,
    });
    if (decision.allowed) {
      return { allowed: true };
    }
    daemon.publishRuntimeEvent("policy.denied", {
      phase: "action",
      target: "action",
      action: actionName,
      code: decision.decision.code,
      route: req.path,
    });
    return {
      allowed: false,
      statusCode: decision.decision.statusCode ?? 403,
      body: {
        error: decision.decision.reason,
        code: decision.decision.code,
      },
    };
  }
  const syncHandlers = {
    announce: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.announce");
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      const response = await rawSyncHandlers.announce(req, res);
      daemon.publishRuntimeEvent("sync.announce", {
        peer_id:
          req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? (req.body as { peer_id?: string }).peer_id
            : undefined,
      });
      return response;
    },
    peers: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.peers");
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      return rawSyncHandlers.peers(req, res);
    },
    updates: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.updates");
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      return rawSyncHandlers.updates(req, res);
    },
    pull: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.pull");
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      const response = await rawSyncHandlers.pull(req, res);
      daemon.publishRuntimeEvent("sync.pull", {
        peer_id:
          req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? (req.body as { peer_id?: string }).peer_id
            : undefined,
      });
      return response;
    },
  };
  const observabilityHandlers = createMirrorObservabilityHandlers(observability);
  let boundPort = config.port;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    runWithMirrorObservabilityContext(observability, () => {
      next();
    });
  });
  app.use((req, res, next) => {
    if (!shouldTrackMirrorSession(req.path)) {
      next();
      return;
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const sessionFromBody = typeof body.session_id === "string" ? body.session_id : undefined;
    const sessionFromHeader = req.header("x-mirror-session-id") ?? undefined;
    const traceId = resolveMirrorTraceId(
      req.header("x-mirror-trace-id") ?? undefined,
      typeof body.trace_id === "string" ? body.trace_id : undefined,
    );
    const sessionId = sessionFromHeader ?? sessionFromBody ?? crypto.randomUUID();
    const sessionUserId =
      typeof body.user_id === "string"
        ? body.user_id
        : body.session && typeof body.session === "object"
          ? ((body.session as { user_id?: unknown }).user_id as string | undefined)
          : undefined;
    const existing = daemon.getSession(sessionId);
    if (existing) {
      daemon.touchSession(sessionId, {
        user_id: sessionUserId,
        metadata: { path: req.path, method: req.method, trace_id: traceId },
      });
    } else {
      daemon.createSession({
        session_id: sessionId,
        user_id: sessionUserId,
        metadata: { path: req.path, method: req.method, trace_id: traceId },
      });
    }
    res.setHeader("x-mirror-session-id", sessionId);
    res.setHeader("x-mirror-trace-id", traceId);
    next();
  });
  const healthHandler = (_req: express.Request, res: express.Response) => {
    const status: MirrorHealthStatus = getMirrordaemonHealthState(daemon, {
      port: boundPort,
      baseUrl: syncManager.getLocalBaseUrl(),
      actionRuntime,
      providerPlane,
      wsConnections: runtimeWebSocket.getConnectionCount(),
      sseAvailable: true,
      wsAvailable: true,
      peersKnown: observability.getMetrics().gauges.peers_known || syncManager.listPeers().length,
    });
    daemon.publishRuntimeEvent("runtime.health.requested", {
      path: "/mirror/health",
    });
    res.json(status);
  };
  const consoleHandlers = createMirrorConsoleHandlers(handlers, {
    syncHandlers,
    observabilityHandlers,
    health: healthHandler,
  });
  const uiApiHandlers = createMirrorUiApiHandlers({
    daemon,
    getRuntime: () =>
      getMirrordaemonRuntimeState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
      }),
    getHealth: () =>
      getMirrordaemonHealthState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
        peersKnown: observability.getMetrics().gauges.peers_known || syncManager.listPeers().length,
      }),
    getBaseUrl: () => syncManager.getLocalBaseUrl(),
  });
  app.use(createMirrorGatewayRouter("/mirror", handlers));
  app.use(createMirrorConsoleRouterAtBase("/mirror/console", consoleHandlers));
  app.use(createMirrorUiApiRouter(uiApiHandlers));
  app.use(createMirrorObservabilityRouter(observabilityHandlers));
  app.use(createMirrorSyncRouter(syncManager, syncHandlers));
  app.get("/mirror/runtime", (_req, res) => {
    res.json(
      getMirrordaemonRuntimeState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
        actionRuntime,
        providerPlane,
        wsConnections: runtimeWebSocket.getConnectionCount(),
        sseAvailable: true,
        wsAvailable: true,
      }),
    );
  });
  app.get("/mirror/runtime/sessions", (_req, res) => {
    res.json({ sessions: daemon.listSessions() });
  });
  app.get("/mirror/runtime/debug", (_req, res) => {
    res.json(
      getMirrordaemonDebugState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
        peersKnown: observability.getMetrics().gauges.peers_known || syncManager.listPeers().length,
      }),
    );
  });
  app.get("/mirror/actions", (_req, res) => {
    res.json(
      getMirrordaemonActionsState(daemon, {
        actionRuntime,
      }),
    );
  });
  app.get("/mirror/providers", (_req, res) => {
    res.json(
      getMirrordaemonProvidersState(daemon, {
        providerPlane,
      }),
    );
  });
  app.get("/mirror/runtime/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const recent = daemon.getRecentEvents();
    for (const event of recent.toReversed()) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    const subscription = daemon.subscribeRuntimeEvents((event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on("close", () => {
      subscription.unsubscribe();
      res.end();
    });
  });
  app.get("/mirror/health", healthHandler);
  app.get("/mirror/status", healthHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const instance = app.listen(config.port, () => resolve(instance));
  });
  const runtimeWebSocket = createMirrorRuntimeWebSocketServer({
    server,
    daemon,
  });
  const address = server.address();
  const port =
    address && typeof address === "object" && "port" in address ? address.port : config.port;
  boundPort = port;
  if (!config.baseUrl) {
    syncManager.setLocalBaseUrl(`http://127.0.0.1:${port}`);
  }

  return {
    app,
    server,
    handlers,
    consoleHandlers,
    syncHandlers,
    syncManager,
    providerPlane,
    runtimeWebSocket,
    daemon,
    config: { ...config, port },
    lifecycle,
    port,
    async shutdown() {
      await runtimeWebSocket.close();
      if (!server.listening) {
        await lifecycle.shutdown();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await lifecycle.shutdown();
    },
  };
}
