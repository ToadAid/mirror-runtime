/**
 * Compatibility-only OpenClaw runtime server wrapper.
 *
 * Canonical standalone Mirror service lives in `src/mirror-service/`.
 */

import express from "express";
import {
  createMirrorGatewayHandlers,
  createMirrorGatewayRouter,
} from "../../../mirror-gateway/index.js";
import { type FetchLike } from "../../../mirror-provider/index.js";
import { createMirrorRuntimeHost, type MirrorRuntimeHost } from "../../../mirror-service/index.js";
import type { RuntimeEnv } from "../../../runtime.js";
import {
  buildCompatBrainChatEnvelope,
  normalizeCompatChatRequest,
  prepareCompatBrainChatRequest,
  readCompatSessionId,
  readCompatTraceId,
  withMirrorCompatLogLevel,
} from "./brain_chat_compat.js";
import { handleHealthEndpoint } from "./health.js";

export async function startRuntimeServer(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
  deps: {
    runtimeHost?: MirrorRuntimeHost;
    fetchImpl?: FetchLike;
  } = {},
): Promise<express.Application> {
  if (process.env.MIRROR_ENABLE_RUNTIME !== "true") {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const runtimeHost =
    deps.runtimeHost ??
    (await createMirrorRuntimeHost(
      {
        providerUrl: brainUrl,
        providerAuthToken: authToken,
      },
      { fetchImpl: deps.fetchImpl },
    ));
  const { gateway, providerPlane, daemon } = runtimeHost;
  const handlers = createMirrorGatewayHandlers(gateway.registry, {
    providerPlane,
    onRuntimeEvent: daemon.publishRuntimeEvent,
    executeAdapterRequest: async (envelope) => await runtimeHost.executeAdapterRequest(envelope),
  });
  const app = express();
  app.use(express.json());
  app.use(createMirrorGatewayRouter("/mirror", handlers));

  app.get("/health", async (_req, res) => {
    try {
      const health = await handleHealthEndpoint(runtimeHost);
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

      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const chatRequest = normalizeCompatChatRequest(payload);
      await withMirrorCompatLogLevel(async () => {
        await prepareCompatBrainChatRequest(chatRequest);

        const adapterResponse = await runtimeHost.executeAdapterRequest(
          buildCompatBrainChatEnvelope({
            request: chatRequest,
            traceId: readCompatTraceId(req, payload),
            sessionId: readCompatSessionId(req, payload),
            routePath:
              typeof req.path === "string" && req.path.length > 0
                ? req.path
                : typeof req.url === "string"
                  ? req.url
                  : "/api/brain/chat",
            method: req.method,
          }),
          {
            provider: {
              url: brainUrl,
              authToken,
            },
            fetchImpl: deps.fetchImpl,
          },
        );
        if (adapterResponse.kind !== "chat.response") {
          throw new Error(`Unexpected Mirror adapter response kind: ${adapterResponse.kind}`);
        }
        res.json(adapterResponse.response);
      });
    } catch (err) {
      env.error(String(err));
      res.status(500).json({ error: String(err) });
    }
  });

  return app;
}
