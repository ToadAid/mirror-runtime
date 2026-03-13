import express from "express";
import {
  getDefaultMirrorObservabilityContext,
  type MirrorObservabilityContext,
} from "./context.js";

export type MirrorObservabilityHandlers = {
  metrics: (req: express.Request, res: express.Response) => void;
  diagnostics: (req: express.Request, res: express.Response) => void;
};

export function createMirrorObservabilityHandlers(
  observability: MirrorObservabilityContext = getDefaultMirrorObservabilityContext(),
): MirrorObservabilityHandlers {
  return {
    metrics: (_req, res) => {
      res.json(observability.getMetrics());
    },
    diagnostics: (_req, res) => {
      res.json(observability.getDiagnostics());
    },
  };
}

export function createMirrorObservabilityRouter(
  handlers = createMirrorObservabilityHandlers(),
): express.Router {
  const router = express.Router();
  router.get("/mirror/metrics", handlers.metrics);
  router.get("/mirror/diagnostics", handlers.diagnostics);
  return router;
}
