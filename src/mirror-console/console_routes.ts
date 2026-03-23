import express from "express";
import type { MirrorGatewayHandlers } from "../mirror-gateway/index.js";
import {
  buildLoreGraph,
  findConceptClusters,
  findRelatedScrolls,
  findScrollsSharingSymbols,
  findSupersessionChains,
} from "../mirror-lore-graph/index.js";
import type {
  MirrorObservabilityContext,
  MirrorObservabilityHandlers,
} from "../mirror-observability/index.js";
import type { MirrorSyncHandlers } from "../mirror-sync/index.js";
import { renderMirrorConsoleHtml } from "./console_static.js";

export type MirrorConsoleHandlers = {
  loadConsole: (req: express.Request, res: express.Response) => void;
  listTools: MirrorGatewayHandlers["listTools"];
  executeTool: MirrorGatewayHandlers["executeTool"];
  executeChat: MirrorGatewayHandlers["executeChat"];
  syncPeers: MirrorSyncHandlers["peers"];
  syncUpdates: MirrorSyncHandlers["updates"];
  syncPull: MirrorSyncHandlers["pull"];
  metrics: MirrorObservabilityHandlers["metrics"];
  diagnostics: MirrorObservabilityHandlers["diagnostics"];
  health: (req: express.Request, res: express.Response) => void;
  relatedScrolls: (req: express.Request, res: express.Response) => Promise<void>;
  symbolClusters: (req: express.Request, res: express.Response) => Promise<void>;
  supersessionChains: (req: express.Request, res: express.Response) => Promise<void>;
  conceptClusters: (req: express.Request, res: express.Response) => Promise<void>;
};

export function createMirrorConsoleHandlers(
  gatewayHandlers: MirrorGatewayHandlers,
  deps: {
    syncHandlers: MirrorSyncHandlers;
    observability: MirrorObservabilityContext;
    observabilityHandlers: MirrorObservabilityHandlers;
    health: (req: express.Request, res: express.Response) => void;
  },
): MirrorConsoleHandlers {
  return {
    loadConsole: (_req, res) => {
      res.type("html").send(renderMirrorConsoleHtml());
    },
    listTools: gatewayHandlers.listTools,
    executeTool: gatewayHandlers.executeTool,
    executeChat: gatewayHandlers.executeChat,
    syncPeers: deps.syncHandlers.peers,
    syncUpdates: deps.syncHandlers.updates,
    syncPull: deps.syncHandlers.pull,
    metrics: deps.observabilityHandlers.metrics,
    diagnostics: deps.observabilityHandlers.diagnostics,
    health: deps.health,
    async relatedScrolls(req, res) {
      deps.observability.incrementMetric("graph_query_frequency");
      deps.observability.logEvent("graph.query", { type: "related" });
      const graph = await buildLoreGraph();
      const scroll = typeof req.query.scroll === "string" ? req.query.scroll : "";
      res.json({ related_scrolls: findRelatedScrolls(graph, scroll) });
    },
    async symbolClusters(req, res) {
      deps.observability.incrementMetric("graph_query_frequency");
      deps.observability.logEvent("graph.query", { type: "symbols" });
      const graph = await buildLoreGraph();
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : "";
      res.json({ scrolls: findScrollsSharingSymbols(graph, symbol) });
    },
    async supersessionChains(req, res) {
      deps.observability.incrementMetric("graph_query_frequency");
      deps.observability.logEvent("graph.query", { type: "supersession" });
      const graph = await buildLoreGraph();
      const scroll = typeof req.query.scroll === "string" ? req.query.scroll : "";
      res.json({ chain: findSupersessionChains(graph, scroll) });
    },
    async conceptClusters(_req, res) {
      deps.observability.incrementMetric("graph_query_frequency");
      deps.observability.logEvent("graph.query", { type: "clusters" });
      const graph = await buildLoreGraph();
      res.json({ clusters: findConceptClusters(graph) });
    },
  };
}

export function createMirrorConsoleRouter(handlers: MirrorConsoleHandlers): express.Router {
  return createMirrorConsoleRouterAtBase("/mirror/console", handlers);
}

export function createMirrorConsoleRouterAtBase(
  basePath: string,
  handlers: MirrorConsoleHandlers,
): express.Router {
  const router = express.Router();
  router.get(basePath, handlers.loadConsole);
  router.get(`${basePath}/api/tools`, handlers.listTools);
  router.post(`${basePath}/api/chat`, handlers.executeChat);
  router.post(`${basePath}/api/tools/:tool_name`, handlers.executeTool);
  router.get(`${basePath}/api/sync/peers`, handlers.syncPeers);
  router.get(`${basePath}/api/sync/updates`, handlers.syncUpdates);
  router.post(`${basePath}/api/sync/pull`, handlers.syncPull);
  router.get(`${basePath}/api/ops/metrics`, handlers.metrics);
  router.get(`${basePath}/api/ops/diagnostics`, handlers.diagnostics);
  router.get(`${basePath}/api/ops/health`, handlers.health);
  router.get(`${basePath}/api/graph/related`, handlers.relatedScrolls);
  router.get(`${basePath}/api/graph/symbols`, handlers.symbolClusters);
  router.get(`${basePath}/api/graph/supersession`, handlers.supersessionChains);
  router.get(`${basePath}/api/graph/clusters`, handlers.conceptClusters);
  return router;
}
