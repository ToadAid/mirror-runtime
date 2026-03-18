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
import {
  authorizeMirrorSettingsWriteRequest,
  readMirrorRequestToken,
  type MirrorGatewayAuthDecision,
} from "../mirror-gateway/auth.js";
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
  buildMirrorChatPolicyTarget,
  buildMirrorActionPolicyTarget,
  buildMirrorProviderPolicyTarget,
  createMirrorPolicyEngine,
  type MirrorPolicyContext,
} from "../mirror-policy/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type MirrorProviderPlane,
} from "../mirror-provider/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import {
  executeMirrorChatWithProviderPlane,
  resolveMirrorTraceId,
  withMirrorCorrelation,
} from "../mirror-runtime/index.js";
import {
  loadMirrorSettingsSync,
  redactMirrorCredentials,
  writeMirrorSettingsFilesSync,
  type MirrorConnectorsSettingsFile,
  type MirrorCoreSettingsFile,
  type MirrorCredentialsSettingsFile,
  type MirrorProvidersSettingsFile,
} from "../mirror-settings/index.js";
import {
  createMirrorSyncHandlers,
  createMirrorSyncManager,
  createMirrorSyncRouter,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import {
  createMirrorTelegramRuntime,
  type MirrorTelegramRuntime,
} from "../mirror-telegram/index.js";
import { createMirrorUiApiHandlers, createMirrorUiApiRouter } from "../mirror-ui-api/index.js";
import { getMirrorWorkspaceSummary } from "../mirror-user-workspace/index.js";
import { createMirrorToolRegistry, getMirrorNativeSkillTools } from "../mirror/skills/index.js";
import {
  createMirrordaemon,
  getMirrordaemonActionsState,
  getMirrordaemonDebugState,
  getMirrordaemonHealthState,
  getMirrordaemonProvidersState,
  getMirrordaemonRuntimeState,
  type MirrordaemonConnectorRuntimeStatus,
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
  telegramRuntime: MirrorTelegramRuntime;
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
  connectors: {
    telegram: {
      state: string;
      enabled: boolean;
      configured: boolean;
      running: boolean;
      updated_at: string;
      last_error: string | null;
      last_error_at: string | null;
      last_error_summary: string | null;
      last_successful_poll_at: string | null;
      updates_processed: number;
      bot: {
        id: number;
        username: string | null;
        display_name: string | null;
      } | null;
      detail: string | null;
    };
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

function denyMirrorSettingsWrite(
  res: express.Response,
  decision: MirrorGatewayAuthDecision,
): express.Response {
  return res.status(decision.statusCode ?? 403).json({
    code:
      decision.code ??
      (decision.statusCode === 503
        ? "mutable_surface_auth_unconfigured"
        : "mutable_surface_auth_required"),
    error: decision.error ?? "Mirror operator authorization required",
  });
}

export async function startMirrorService(
  overrides: Partial<MirrorServiceConfig> = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<MirrorService> {
  const config = loadMirrorServiceConfig(overrides);
  const bootSettings = loadMirrorSettingsSync();
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
  const connectorRuntime: {
    telegram: MirrordaemonConnectorRuntimeStatus;
  } = {
    telegram: {
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
    },
  };
  const telegramRuntime = await createMirrorTelegramRuntime({
    settings: bootSettings,
    fetchImpl: deps.fetchImpl,
    onStatusChange(status) {
      connectorRuntime.telegram = status;
    },
    onRuntimeEvent(type, payload) {
      daemon.publishRuntimeEvent(type, payload);
    },
    async onMessage(message) {
      const text = message.text.trim();
      if (text.length === 0) {
        return null;
      }

      const userId = `telegram:${message.from?.id ?? message.chat_id}`;
      const sessionId = `telegram:${message.chat_id}`;
      const traceId = resolveMirrorTraceId(undefined);
      const activeProvider = providerPlane.getActiveProvider();
      const existing = daemon.getSession(sessionId);
      if (existing) {
        daemon.touchSession(sessionId, {
          user_id: userId,
          metadata: {
            surface: "telegram",
            chat_id: message.chat_id,
            chat_type: message.chat_type,
            trace_id: traceId,
          },
        });
      } else {
        daemon.createSession({
          session_id: sessionId,
          user_id: userId,
          metadata: {
            surface: "telegram",
            chat_id: message.chat_id,
            chat_type: message.chat_type,
            trace_id: traceId,
          },
        });
      }

      const request = {
        model: bootSettings.provider.active?.model ?? "mirror-default",
        user_id: userId,
        messages: [{ role: "user" as const, content: text }],
        session: {
          session_id: sessionId,
          user_id: userId,
          tool_context: {
            surface: "telegram",
            chat_id: message.chat_id,
            chat_type: message.chat_type,
          },
        },
        correlation: {
          trace_id: traceId,
          session_id: sessionId,
        },
      };
      const policyContext: MirrorPolicyContext = {
        surface: "adapter",
        actor: {
          user_id: userId,
          external_user_id: message.from ? String(message.from.id) : String(message.chat_id),
          display_name: message.from?.display_name,
        },
        session: {
          session_id: sessionId,
          external_session_id: String(message.chat_id),
          conversation_id: String(message.chat_id),
          channel_id: String(message.chat_id),
        },
        adapter: {
          adapter_id: "telegram",
          surface: "telegram",
          transport: "polling",
          capabilities: ["chat", "policy_context", "session_resume"],
        },
        metadata: {
          trace_id: traceId,
          telegram_chat_id: message.chat_id,
          telegram_chat_type: message.chat_type,
          telegram_update_id: message.update_id,
        },
      };

      const ingressDecision = await policy.evaluate({
        phase: "ingress",
        target: buildMirrorChatPolicyTarget(request),
        context: policyContext,
      });
      if (!ingressDecision.allowed) {
        daemon.publishRuntimeEvent(
          "policy.denied",
          withMirrorCorrelation(
            {
              phase: "ingress",
              target: "chat",
              code: ingressDecision.decision.code,
              route: "telegram",
            },
            request.correlation,
          ),
        );
        throw new Error(ingressDecision.decision.reason);
      }

      const providerDecision = await policy.evaluate({
        phase: "provider",
        target: buildMirrorProviderPolicyTarget(request, {
          url: activeProvider?.url ?? "",
        }),
        context: {
          ...policyContext,
          metadata: {
            ...policyContext.metadata,
            provider_url: activeProvider?.url ?? "",
          },
        },
      });
      if (!providerDecision.allowed) {
        daemon.publishRuntimeEvent(
          "policy.denied",
          withMirrorCorrelation(
            {
              phase: "provider",
              target: "provider",
              code: providerDecision.decision.code,
              route: "telegram",
            },
            request.correlation,
          ),
        );
        throw new Error(providerDecision.decision.reason);
      }

      daemon.publishRuntimeEvent(
        "chat.started",
        withMirrorCorrelation(
          {
            route: "telegram",
            model: request.model,
          },
          request.correlation,
        ),
      );
      try {
        const response = await executeMirrorChatWithProviderPlane(request, {
          providerPlane,
          fetchImpl: deps.fetchImpl,
          onRuntimeEvent: (type, payload) => {
            daemon.publishRuntimeEvent(
              type,
              withMirrorCorrelation(payload ?? {}, request.correlation),
            );
          },
          correlation: request.correlation,
        });
        daemon.publishRuntimeEvent(
          "chat.finished",
          withMirrorCorrelation(
            {
              route: "telegram",
              model: response.model,
              finish_reason: response.choices[0]?.finish_reason,
            },
            request.correlation,
          ),
        );
        return response.choices[0]?.message?.content?.trim() || null;
      } catch (error) {
        daemon.publishRuntimeEvent(
          "chat.failed",
          withMirrorCorrelation(
            {
              route: "telegram",
              error: error instanceof Error ? error.message : String(error),
            },
            request.correlation,
          ),
        );
        throw error;
      }
    },
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
      connectorRuntime,
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
        connectorRuntime,
      }),
    getHealth: () =>
      getMirrordaemonHealthState(daemon, {
        port: boundPort,
        baseUrl: syncManager.getLocalBaseUrl(),
        peersKnown: observability.getMetrics().gauges.peers_known || syncManager.listPeers().length,
        connectorRuntime,
      }),
    getBaseUrl: () => syncManager.getLocalBaseUrl(),
    getWorkspace: async () => await getMirrorWorkspaceSummary(),
  });
  app.use(createMirrorGatewayRouter("/mirror", handlers));
  app.use(createMirrorConsoleRouterAtBase("/mirror/console", consoleHandlers));
  app.use(createMirrorUiApiRouter(uiApiHandlers));
  app.use(createMirrorObservabilityRouter(observabilityHandlers));
  app.use(createMirrorSyncRouter(syncManager, syncHandlers));
  app.get("/mirror/ui/app", consoleHandlers.loadConsole);
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
        connectorRuntime,
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
        connectorRuntime,
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
  app.get("/mirror/workspace", async (_req, res) => {
    res.json(await getMirrorWorkspaceSummary());
  });
  app.get("/mirror/settings", (_req, res) => {
    const settings = loadMirrorSettingsSync();
    res.json({
      mirror: settings.files.mirror,
      providers: settings.files.providers,
      connectors: settings.files.connectors,
      credentials: redactMirrorCredentials(settings.files.credentials),
      resolved: {
        runtime: settings.runtime,
        workspace: settings.workspace,
        provider: {
          default_provider_id: settings.provider.default_provider_id,
          active: settings.provider.active
            ? {
                id: settings.provider.active.id,
                kind: settings.provider.active.kind,
                label: settings.provider.active.label,
                url: settings.provider.active.url,
                model: settings.provider.active.model,
                enabled: settings.provider.active.enabled,
                credential_id: settings.provider.active.credential_id,
              }
            : null,
        },
        connectors: connectorRuntime,
      },
    });
  });
  app.put("/mirror/settings", (req, res) => {
    const authDecision = authorizeMirrorSettingsWriteRequest(req);
    if (!authDecision.allowed) {
      return denyMirrorSettingsWrite(res, authDecision);
    }
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as {
            mirror?: MirrorCoreSettingsFile;
            providers?: MirrorProvidersSettingsFile;
            connectors?: MirrorConnectorsSettingsFile;
          })
        : null;
    if (!body) {
      return res.status(400).json({ error: "Mirror settings request body must be an object" });
    }
    const next = writeMirrorSettingsFilesSync({
      mirror: body.mirror,
      providers: body.providers,
      connectors: body.connectors,
    });
    daemon.publishRuntimeEvent("settings.updated", {
      mirror: Boolean(body.mirror),
      providers: Boolean(body.providers),
      connectors: Boolean(body.connectors),
    });
    return res.json({
      ok: true,
      restart_required: true,
      mirror: next.mirror,
      providers: next.providers,
      connectors: next.connectors,
    });
  });
  app.put("/mirror/settings/credentials", (req, res) => {
    const authDecision = authorizeMirrorSettingsWriteRequest(req);
    if (!authDecision.allowed) {
      return denyMirrorSettingsWrite(res, authDecision);
    }
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as { credentials?: MirrorCredentialsSettingsFile["credentials"] })
        : null;
    if (!body || !body.credentials || typeof body.credentials !== "object") {
      return res.status(400).json({ error: "Mirror credentials payload must be an object" });
    }
    const settings = loadMirrorSettingsSync();
    const nextCredentials: MirrorCredentialsSettingsFile = {
      ...settings.files.credentials,
      credentials: {
        ...settings.files.credentials.credentials,
        ...body.credentials,
      },
    };
    writeMirrorSettingsFilesSync({
      credentials: nextCredentials,
    });
    daemon.publishRuntimeEvent("settings.credentials.updated", {
      keys: Object.keys(body.credentials),
    });
    return res.json({
      ok: true,
      restart_required: true,
      credentials: redactMirrorCredentials(nextCredentials),
    });
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
    telegramRuntime,
    port,
    async shutdown() {
      await telegramRuntime.shutdown();
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
