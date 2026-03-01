/**
 * Runtime Server Integration
 *
 * Implements /health and /api/brain/chat endpoints.
 * Validates environment before starting.
 */

import express from "express";
import type { RuntimeEnv } from "../../runtime.js";
import { handleBrainChatEndpoint } from "./brain-chat.js";
import { handleHealthEndpoint } from "./health.js";

export async function startRuntimeServer(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
): Promise<express.Application> {
  // Validate environment ONLY when runtime is enabled
  if (process.env.MIRROR_ENABLE_RUNTIME !== "true") {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const app = express();

  // Middleware
  app.use(express.json());

  // /health — Local-only status check. NO network calls.
  app.get("/health", async (req, res) => {
    try {
      const health = await handleHealthEndpoint(env, brainUrl, authToken);
      res.json(health);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // /api/brain/chat — OpenAI-compatible proxy to Brain
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
