/**
 * Runtime Server Integration
 *
 * Implements /health and /api/brain/chat endpoints.
 * Validates environment before starting.
 */

import express from "express";
import type { RuntimeEnv } from "../../runtime.js";
import { consultPond } from "../mirror/pond/consult.js";
import { orchestratePondLoreQuery } from "../mirror/pond/orchestrate.js";
import { listPondAgents, refreshPond } from "../mirror/pond/service.js";
import { synthesizePondResult } from "../mirror/pond/synthesize.js";
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

  app.get("/pond/agents", (_req, res) => {
    const agents = listPondAgents();
    res.json({
      count: agents.length,
      agents,
    });
  });

  app.post("/pond/refresh", async (_req, res) => {
    try {
      const agents = await refreshPond();
      res.json({ discovered: agents.length, agents });
    } catch (err) {
      res.status(500).json({ discovered: 0, error: String(err) });
    }
  });

  app.post("/pond/query", async (req, res) => {
    const from = req.body?.from;
    const to = req.body?.to;
    const message = req.body?.message;

    if (typeof from !== "string" || from.trim().length === 0) {
      return res.status(400).json({ error: "from is required" });
    }
    if (typeof to !== "string" || to.trim().length === 0) {
      return res.status(400).json({ error: "to is required" });
    }
    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message is required" });
    }

    try {
      const orchestration = await orchestratePondLoreQuery({ from, to, message });
      const synthesis = synthesizePondResult(orchestration);
      res.json({ orchestration, synthesis });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/pond/consult", async (req, res) => {
    const from = req.body?.from;
    const to = req.body?.to;
    const message = req.body?.message;

    if (typeof to !== "string" || to.trim().length === 0) {
      return res.status(400).json({ error: "to is required" });
    }
    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message is required" });
    }
    if (from !== undefined && (typeof from !== "string" || from.trim().length === 0)) {
      return res.status(400).json({ error: "from must be a non-empty string when provided" });
    }

    try {
      const result = await consultPond({
        to,
        message,
        ...(typeof from === "string" ? { from } : {}),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  void refreshPond().catch((err) => {
    env.error("[POND] refresh failed:", String(err));
  });

  return app;
}
