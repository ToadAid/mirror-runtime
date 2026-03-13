import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import {
  createMirrorConsoleHandlers,
  createMirrorConsoleRouterAtBase,
  type MirrorConsoleHandlers,
} from "../mirror-console/index.js";
import type { MirrorGatewayHandlers } from "../mirror-gateway/index.js";
import { createMirrorGatewayHandlers, createMirrorGatewayRouter } from "../mirror-gateway/index.js";
import {
  createMirrorObservabilityHandlers,
  createMirrorObservabilityRouter,
  getMirrorMetrics,
} from "../mirror-observability/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import {
  createMirrorSyncHandlers,
  createMirrorSyncManager,
  createMirrorSyncRouter,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import {
  createMirrordaemon,
  getMirrordaemonDebugState,
  getMirrordaemonHealthState,
  getMirrordaemonRuntimeState,
  type Mirrordaemon,
} from "../mirrordaemon/index.js";
import { loadMirrorServiceConfig, type MirrorServiceConfig } from "./config.js";
import { initializeMirrorServiceLifecycle, type MirrorServiceLifecycle } from "./lifecycle.js";

export type MirrorService = {
  app: express.Application;
  server: http.Server;
  handlers: MirrorGatewayHandlers;
  consoleHandlers: MirrorConsoleHandlers;
  syncHandlers: ReturnType<typeof createMirrorSyncHandlers>;
  syncManager: MirrorSyncManager;
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

  const handlers = createMirrorGatewayHandlers(undefined, {
    provider: {
      url: config.providerUrl,
      authToken: config.providerAuthToken,
    },
    fetchImpl: deps.fetchImpl,
  });
  const syncManager = createMirrorSyncManager({
    nodeId: config.nodeId,
    loreDir: config.loreDir,
    baseUrl: config.baseUrl,
    fetchImpl: deps.fetchImpl,
  });
  const daemon = createMirrordaemon({
    config,
    lifecycle,
  });
  const rawSyncHandlers = createMirrorSyncHandlers(syncManager);
  const syncHandlers = {
    announce: async (req: express.Request, res: express.Response) => {
      const response = await rawSyncHandlers.announce(req, res);
      daemon.publishRuntimeEvent("sync.announce", {
        peer_id:
          req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? (req.body as { peer_id?: string }).peer_id
            : undefined,
      });
      return response;
    },
    peers: (req: express.Request, res: express.Response) => rawSyncHandlers.peers(req, res),
    updates: async (req: express.Request, res: express.Response) =>
      rawSyncHandlers.updates(req, res),
    pull: async (req: express.Request, res: express.Response) => {
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
  const observabilityHandlers = createMirrorObservabilityHandlers();
  let boundPort = config.port;
  const app = express();
  app.use(express.json());
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
        metadata: { path: req.path, method: req.method },
      });
    } else {
      daemon.createSession({
        session_id: sessionId,
        user_id: sessionUserId,
        metadata: { path: req.path, method: req.method },
      });
    }
    res.setHeader("x-mirror-session-id", sessionId);
    next();
  });
  const healthHandler = (_req: express.Request, res: express.Response) => {
    const status: MirrorHealthStatus = getMirrordaemonHealthState(daemon, {
      port: boundPort,
      baseUrl: syncManager.getLocalBaseUrl(),
      peersKnown: getMirrorMetrics().gauges.peers_known || syncManager.listPeers().length,
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
  app.use(createMirrorGatewayRouter("/mirror", handlers));
  app.use(createMirrorConsoleRouterAtBase("/mirror/console", consoleHandlers));
  app.use(createMirrorObservabilityRouter(observabilityHandlers));
  app.use(createMirrorSyncRouter(syncManager, syncHandlers));
  app.get("/mirror/runtime", (_req, res) => {
    res.json(
      getMirrordaemonRuntimeState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
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
        peersKnown: getMirrorMetrics().gauges.peers_known || syncManager.listPeers().length,
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
    daemon,
    config: { ...config, port },
    lifecycle,
    port,
    async shutdown() {
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
