import http from "node:http";
import express from "express";
import {
  createMirrorConsoleHandlers,
  createMirrorConsoleRouterAtBase,
  type MirrorConsoleHandlers,
} from "../mirror-console/index.js";
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
import { type MirrorProviderPlane } from "../mirror-provider/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import {
  createMirrorSyncRouter,
  type MirrorSyncHandlers,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import { createMirrorUiApiHandlers, createMirrorUiApiRouter } from "../mirror-ui-api/index.js";
import {
  getMirrordaemonActionsState,
  getMirrordaemonDebugState,
  getMirrordaemonHealthState,
  getMirrordaemonProvidersState,
  getMirrordaemonRuntimeState,
  type Mirrordaemon,
} from "../mirrordaemon/index.js";
import { type MirrorServiceConfig } from "./config.js";
import { type MirrorServiceLifecycle } from "./lifecycle.js";
import {
  createMirrorRuntimeWebSocketServer,
  type MirrorRuntimeWebSocketServer,
} from "./runtime_events_ws.js";
import { createMirrorRuntimeHost, type MirrorRuntimeHost } from "./runtime_host.js";
import { createMirrorSessionIngressMiddleware } from "./session_ingress.js";
import { createMirrorServiceSyncHandlers } from "./sync_handlers.js";

export type MirrorService = {
  app: express.Application;
  server: http.Server;
  handlers: MirrorGatewayHandlers;
  consoleHandlers: MirrorConsoleHandlers;
  syncHandlers: MirrorSyncHandlers;
  syncManager: MirrorSyncManager;
  providerPlane: MirrorProviderPlane;
  runtimeWebSocket: MirrorRuntimeWebSocketServer;
  daemon: Mirrordaemon;
  runtimeHost: MirrorRuntimeHost;
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

export async function startMirrorService(
  overrides: Partial<MirrorServiceConfig> = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<MirrorService> {
  const runtimeHost = await createMirrorRuntimeHost(overrides, deps);
  const { config, lifecycle, daemon, providerPlane, syncManager, gateway } = runtimeHost;
  const observability = daemon.getObservability();
  const policy = gateway.policy;
  const actionRuntime = gateway.actionRuntime;

  const handlers = createMirrorGatewayHandlers(gateway.registry, {
    providerPlane,
    onRuntimeEvent: daemon.publishRuntimeEvent,
    executeAdapterRequest: async (envelope) => await runtimeHost.executeAdapterRequest(envelope),
  });
  const syncHandlers = createMirrorServiceSyncHandlers({
    daemon,
    policy,
    syncManager,
  });
  const observabilityHandlers = createMirrorObservabilityHandlers(observability);
  let boundPort = config.port;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    runWithMirrorObservabilityContext(observability, () => {
      next();
    });
  });
  app.use(createMirrorSessionIngressMiddleware(daemon));
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
    runtimeHost,
    config: { ...config, port },
    lifecycle,
    port,
    async shutdown() {
      await runtimeWebSocket.close();
      if (!server.listening) {
        await runtimeHost.shutdown();
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
      await runtimeHost.shutdown();
    },
  };
}
