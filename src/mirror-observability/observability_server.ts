import express from "express";
import { getMirrorDiagnostics } from "./diagnostics.js";
import { getMirrorMetrics } from "./metrics.js";

export type MirrorObservabilityHandlers = {
  metrics: (req: express.Request, res: express.Response) => void;
  diagnostics: (req: express.Request, res: express.Response) => void;
};

export function createMirrorObservabilityHandlers(): MirrorObservabilityHandlers {
  return {
    metrics: (_req, res) => {
      res.json(getMirrorMetrics());
    },
    diagnostics: (_req, res) => {
      res.json(getMirrorDiagnostics());
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
