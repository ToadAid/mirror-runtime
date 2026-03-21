import crypto from "node:crypto";
import express from "express";
import {
  buildHttpToolAdapterEnvelope,
  type MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import { incrementToolExecution, logMirrorEvent } from "../mirror-observability/index.js";
import type { MirrorPolicyContext } from "../mirror-policy/index.js";
import { withMirrorCorrelation } from "../mirror-runtime/index.js";
import type { MirrorSkillTool } from "../mirror/skills/index.js";
import { validateMirrorToolInput } from "./routes.js";

type BuildPolicyContext = (
  req: express.Request,
  body: Record<string, unknown>,
) => MirrorPolicyContext;

type ReadIngressAdapterDescriptor = (routePath: string) => {
  adapterId: "mirror-service-http" | "mirror-console-http";
  surface: "service" | "console";
};

type ExecuteMirrorGatewayToolRouteOptions = {
  buildPolicyContext: BuildPolicyContext;
  executeAdapterRequest: (
    envelope: ReturnType<typeof buildHttpToolAdapterEnvelope>,
  ) => Promise<MirrorAdapterResponseEnvelope>;
  onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
  readIngressAdapterDescriptor: ReadIngressAdapterDescriptor;
  readIngressRoutePath: (req: express.Request) => string;
  recordWorkspaceToolObservability: (toolName: string) => void;
  tool: MirrorSkillTool;
};

export async function executeMirrorGatewayToolRoute(
  options: ExecuteMirrorGatewayToolRouteOptions,
  req: express.Request,
  res: express.Response,
): Promise<express.Response | void> {
  const toolNameParam = req.params.tool_name;
  if (typeof toolNameParam !== "string") {
    return res.status(400).json({ error: "Mirror tool name must be a string" });
  }

  const toolName = toolNameParam;
  const payload =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const errors = validateMirrorToolInput(payload, options.tool.inputSchema);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid tool input", details: errors });
  }

  const policyContext = options.buildPolicyContext(req, payload);
  const correlation = {
    trace_id: String(policyContext.metadata?.trace_id),
    session_id: policyContext.session?.session_id,
  };

  try {
    res.setHeader("x-mirror-trace-id", correlation.trace_id);
    const adapterDescriptor = options.readIngressAdapterDescriptor(
      options.readIngressRoutePath(req),
    );
    const actionId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    options.onRuntimeEvent?.(
      "tool.execution.started",
      withMirrorCorrelation(
        {
          tool: options.tool.metadata.name,
        },
        {
          trace_id: correlation.trace_id,
          session_id: correlation.session_id,
          action_id: actionId,
        },
      ),
    );
    incrementToolExecution(options.tool.metadata.name);
    logMirrorEvent("tool.execution", { tool: options.tool.metadata.name });
    logMirrorEvent("action.execution", { action: options.tool.metadata.name });
    options.onRuntimeEvent?.(
      "action.execution.started",
      withMirrorCorrelation(
        {
          action: options.tool.metadata.name,
          execution_id: executionId,
        },
        {
          trace_id: correlation.trace_id,
          session_id: correlation.session_id,
          action_id: actionId,
        },
      ),
    );
    options.recordWorkspaceToolObservability(options.tool.metadata.name);
    const adapterResponse = await options.executeAdapterRequest(
      buildHttpToolAdapterEnvelope({
        req,
        body: payload,
        toolName,
        adapterId: adapterDescriptor.adapterId,
        surface: adapterDescriptor.surface,
      }),
    );
    if (adapterResponse.kind !== "tool.response") {
      throw new Error(`Unexpected Mirror adapter response kind: ${adapterResponse.kind}`);
    }
    const reviewStatus =
      adapterResponse.response.result.review &&
      typeof adapterResponse.response.result.review === "object"
        ? (adapterResponse.response.result.review as { status?: unknown }).status
        : undefined;
    if (typeof reviewStatus === "string") {
      options.onRuntimeEvent?.(
        "review.decision",
        withMirrorCorrelation(
          {
            tool: options.tool.metadata.name,
            status: reviewStatus,
          },
          {
            trace_id: correlation.trace_id,
            session_id: correlation.session_id,
            action_id: actionId,
          },
        ),
      );
    }
    options.onRuntimeEvent?.(
      "tool.execution.finished",
      withMirrorCorrelation(
        {
          tool: options.tool.metadata.name,
        },
        {
          trace_id: correlation.trace_id,
          session_id: correlation.session_id,
          action_id: actionId,
        },
      ),
    );
    options.onRuntimeEvent?.(
      "action.execution.finished",
      withMirrorCorrelation(
        {
          action: options.tool.metadata.name,
          execution_id: executionId,
        },
        {
          trace_id: correlation.trace_id,
          session_id: correlation.session_id,
          action_id: actionId,
        },
      ),
    );
    return res.json({
      tool: options.tool.metadata.name,
      result: adapterResponse.response.result,
    });
  } catch (error) {
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
    if (code) {
      options.onRuntimeEvent?.(
        "tool.execution.failed",
        withMirrorCorrelation(
          {
            tool: options.tool.metadata.name,
            error: error instanceof Error ? error.message : String(error),
          },
          {
            trace_id: String(policyContext.metadata?.trace_id),
            session_id: policyContext.session?.session_id,
          },
        ),
      );
      options.onRuntimeEvent?.(
        "policy.denied",
        withMirrorCorrelation(
          {
            phase: "adapter",
            target: "action",
            tool: options.tool.metadata.name,
            code,
            route: req.path,
          },
          {
            trace_id: String(policyContext.metadata?.trace_id),
            session_id: policyContext.session?.session_id,
          },
        ),
      );
      options.onRuntimeEvent?.(
        "action.execution.failed",
        withMirrorCorrelation(
          {
            action: options.tool.metadata.name,
            error: error instanceof Error ? error.message : String(error),
          },
          {
            trace_id: String(policyContext.metadata?.trace_id),
            session_id: policyContext.session?.session_id,
          },
        ),
      );
      return res.status(statusCode).json({
        error: error instanceof Error ? error.message : String(error),
        code,
      });
    }
    options.onRuntimeEvent?.(
      "tool.execution.failed",
      withMirrorCorrelation(
        {
          tool: options.tool.metadata.name,
          error: error instanceof Error ? error.message : String(error),
        },
        {
          trace_id: String(policyContext.metadata?.trace_id),
          session_id: policyContext.session?.session_id,
        },
      ),
    );
    options.onRuntimeEvent?.(
      "action.execution.failed",
      withMirrorCorrelation(
        {
          action: options.tool.metadata.name,
          error: error instanceof Error ? error.message : String(error),
        },
        {
          trace_id: String(policyContext.metadata?.trace_id),
          session_id: policyContext.session?.session_id,
        },
      ),
    );
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
