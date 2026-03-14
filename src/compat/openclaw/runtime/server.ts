/**
 * Compatibility-only OpenClaw runtime server wrapper.
 *
 * Canonical standalone Mirror service lives in `src/mirror-service/`.
 */

import express from "express";
import { createMirrorGatewayRouter } from "../../../mirror-gateway/index.js";
import type { RuntimeEnv } from "../../../runtime.js";
import { handleBrainChatEndpoint } from "./brain-chat.js";
import { handleHealthEndpoint } from "./health.js";

export async function startRuntimeServer(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
): Promise<express.Application> {
  if (process.env.MIRROR_ENABLE_RUNTIME !== "true") {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const app = express();
  app.use(express.json());
  app.use(createMirrorGatewayRouter("/mirror"));

  app.get("/health", async (_req, res) => {
    try {
      const health = await handleHealthEndpoint(env, brainUrl, authToken);
      res.json(health);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post("/api/brain/chat", async (req, res) => {
    try {
      if (!brainUrl) {
        return res.status(400).json({ error: "brainUrl not configured" });
      }
      if (!authToken) {
        return res.status(400).json({ error: "authToken not configured" });
      }

      const chatReq = req.body;
      const chatRes = await handleBrainChatEndpoint(env, brainUrl, authToken, chatReq);
      res.json(chatRes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return app;
}
