import express from "express";
import {
  buildHttpChatAdapterEnvelope,
  type MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import { incrementMetric, logMirrorEvent } from "../mirror-observability/index.js";
import type { MirrorPolicyContext } from "../mirror-policy/index.js";
import { withMirrorCorrelation } from "../mirror-runtime/index.js";

type BuildPolicyContext = (
  req: express.Request,
  body: Record<string, unknown>,
) => MirrorPolicyContext;

type ReadIngressAdapterDescriptor = (routePath: string) => {
  adapterId: "mirror-service-http" | "mirror-console-http";
  surface: "service" | "console";
};

type ExecuteMirrorGatewayChatRouteOptions = {
  buildPolicyContext: BuildPolicyContext;
  executeAdapterRequest: (
    envelope: ReturnType<typeof buildHttpChatAdapterEnvelope>,
  ) => Promise<MirrorAdapterResponseEnvelope>;
  onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
  readIngressAdapterDescriptor: ReadIngressAdapterDescriptor;
  readIngressRoutePath: (req: express.Request) => string;
};

export async function executeMirrorGatewayChatRoute(
  options: ExecuteMirrorGatewayChatRouteOptions,
  req: express.Request,
  res: express.Response,
): Promise<express.Response | void> {
  const payload =
    req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
  if (!payload) {
    return res.status(400).json({ error: "Mirror chat request must be an object" });
  }

  try {
    const policyContext = options.buildPolicyContext(req, payload);
    const correlation = {
      trace_id: String(policyContext.metadata?.trace_id),
      session_id: policyContext.session?.session_id,
    };
    res.setHeader("x-mirror-trace-id", correlation.trace_id);
    const adapterDescriptor = options.readIngressAdapterDescriptor(
      options.readIngressRoutePath(req),
    );
    incrementMetric("chat_requests");
    logMirrorEvent("chat.pipeline", { route: "mirror.chat" });
    options.onRuntimeEvent?.(
      "chat.started",
      withMirrorCorrelation(
        {
          route: "mirror.chat",
          model: typeof payload.model === "string" ? payload.model : undefined,
        },
        correlation,
      ),
    );
    const adapterResponse = await options.executeAdapterRequest(
      buildHttpChatAdapterEnvelope({
        req,
        body: payload,
        adapterId: adapterDescriptor.adapterId,
        surface: adapterDescriptor.surface,
      }),
    );
    if (adapterResponse.kind !== "chat.response") {
      throw new Error(`Unexpected Mirror adapter response kind: ${adapterResponse.kind}`);
    }
    options.onRuntimeEvent?.(
      "chat.finished",
      withMirrorCorrelation(
        {
          route: "mirror.chat",
          model: adapterResponse.response.model,
          finish_reason: adapterResponse.response.choices[0]?.finish_reason,
        },
        correlation,
      ),
    );
    return res.json({ response: adapterResponse.response });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const policyContext = options.buildPolicyContext(req, payload);
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    const statusCode =
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    options.onRuntimeEvent?.(
      "chat.failed",
      withMirrorCorrelation(
        {
          route: "mirror.chat",
          error: errorMessage,
        },
        {
          trace_id: String(policyContext.metadata?.trace_id),
          session_id: policyContext.session?.session_id,
        },
      ),
    );
    if (code) {
      options.onRuntimeEvent?.(
        "policy.denied",
        withMirrorCorrelation(
          {
            phase: "adapter",
            target: "chat",
            code,
            route: req.path,
          },
          {
            trace_id: String(policyContext.metadata?.trace_id),
            session_id: policyContext.session?.session_id,
          },
        ),
      );
      return res.status(statusCode).json({ error: errorMessage, code });
    }
    return res.status(statusCode).json({ error: errorMessage });
  }
}
