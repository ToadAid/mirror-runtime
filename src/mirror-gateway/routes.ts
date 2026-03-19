import crypto from "node:crypto";
import express from "express";
import {
  buildHttpChatAdapterEnvelope,
  buildHttpToolAdapterEnvelope,
  type MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import {
  incrementMetric,
  incrementToolExecution,
  logMirrorEvent,
} from "../mirror-observability/index.js";
import { type MirrorPolicyContext } from "../mirror-policy/index.js";
import { type MirrorProviderConfig, type MirrorProviderPlane } from "../mirror-provider/index.js";
import { resolveMirrorTraceId, withMirrorCorrelation } from "../mirror-runtime/index.js";
import {
  createMirrorToolRegistry,
  getMirrorNativeSkillTools,
  type MirrorSkillTool,
  type MirrorToolInputSchema,
} from "../mirror/skills/index.js";
import { readMirrorRequestToken } from "./auth.js";

function validateValueAgainstType(
  value: unknown,
  type: MirrorToolInputSchema["properties"][string]["type"],
): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

export function validateMirrorToolInput(
  input: Record<string, unknown>,
  schema: MirrorToolInputSchema,
): string[] {
  const errors: string[] = [];

  for (const requiredKey of schema.required ?? []) {
    if (!(requiredKey in input)) {
      errors.push(`missing required field: ${requiredKey}`);
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in input) || input[key] === undefined) {
      continue;
    }
    const value = input[key];
    if (!validateValueAgainstType(value, property.type)) {
      errors.push(`field ${key} must be ${property.type}`);
      continue;
    }
    if (property.enum && typeof value === "string" && !property.enum.includes(value)) {
      errors.push(`field ${key} must be one of: ${property.enum.join(", ")}`);
    }
  }

  return errors;
}

function listToolMetadata(tools: MirrorSkillTool[]) {
  return tools.map((tool) => ({
    metadata: tool.metadata,
    inputSchema: tool.inputSchema,
  }));
}

export type MirrorGatewayHandlers = {
  listTools: (req: express.Request, res: express.Response) => void;
  executeChat: (req: express.Request, res: express.Response) => Promise<express.Response | void>;
  executeTool: (req: express.Request, res: express.Response) => Promise<express.Response | void>;
};

export function createMirrorGatewayHandlers(
  registry = createMirrorToolRegistry(getMirrorNativeSkillTools()),
  options: {
    provider?: MirrorProviderConfig;
    providerPlane?: MirrorProviderPlane;
    onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
    executeAdapterRequest: (
      envelope:
        | ReturnType<typeof buildHttpChatAdapterEnvelope>
        | ReturnType<typeof buildHttpToolAdapterEnvelope>,
    ) => Promise<MirrorAdapterResponseEnvelope>;
  },
): MirrorGatewayHandlers {
  function buildPolicyContext(
    req: express.Request,
    body: Record<string, unknown>,
  ): MirrorPolicyContext {
    const routePath = typeof req.path === "string" ? req.path : "";
    const isConsoleRoute = routePath.startsWith("/mirror/console/");
    const requestMethod = typeof req.method === "string" ? req.method : "UNKNOWN";
    const header =
      typeof req.header === "function"
        ? (name: string) => req.header(name)
        : (_name: string) => undefined;
    const session =
      body.session && typeof body.session === "object" && !Array.isArray(body.session)
        ? (body.session as Record<string, unknown>)
        : {};
    const traceId = resolveMirrorTraceId(
      header("x-mirror-trace-id"),
      typeof body.trace_id === "string" ? body.trace_id : undefined,
      typeof session.trace_id === "string" ? session.trace_id : undefined,
    );
    return {
      surface: isConsoleRoute ? "console" : "service",
      route: routePath,
      request_token: readMirrorRequestToken(req),
      actor: {
        user_id:
          typeof body.user_id === "string"
            ? body.user_id
            : typeof session.user_id === "string"
              ? session.user_id
              : undefined,
      },
      session: {
        session_id:
          header("x-mirror-session-id") ??
          (typeof body.session_id === "string" ? body.session_id : undefined) ??
          (typeof session.session_id === "string" ? session.session_id : undefined),
      },
      metadata: {
        method: requestMethod,
        trace_id: traceId,
      },
    };
  }

  function recordWorkspaceToolObservability(toolName: string): void {
    if (toolName.startsWith("mirror.task.")) {
      incrementMetric("workspace_events");
      incrementMetric("task_operations");
      logMirrorEvent("workspace.task", { tool: toolName });
      return;
    }

    if (toolName.startsWith("mirror.reminder.")) {
      incrementMetric("workspace_events");
      incrementMetric("reminder_operations");
      logMirrorEvent("workspace.reminder", { tool: toolName });
      return;
    }

    if (toolName.startsWith("mirror.heartbeat.")) {
      incrementMetric("workspace_events");
      incrementMetric("heartbeat_operations");
      logMirrorEvent("workspace.heartbeat", { tool: toolName });
      return;
    }

    if (toolName.startsWith("mirror.monk.")) {
      incrementMetric("workspace_events");
      incrementMetric("monk_actions");
      logMirrorEvent("workspace.monk", { tool: toolName });
    }
  }

  function readIngressRoutePath(req: express.Request): string {
    if (typeof req.path === "string" && req.path.length > 0) {
      return req.path;
    }
    if (typeof req.originalUrl === "string" && req.originalUrl.length > 0) {
      return req.originalUrl;
    }
    if (typeof req.url === "string" && req.url.length > 0) {
      return req.url;
    }
    return "";
  }

  function readIngressAdapterDescriptor(routePath: string): {
    adapterId: "mirror-service-http" | "mirror-console-http";
    surface: "service" | "console";
  } {
    if (routePath.startsWith("/mirror/console/")) {
      return {
        adapterId: "mirror-console-http",
        surface: "console",
      };
    }
    return {
      adapterId: "mirror-service-http",
      surface: "service",
    };
  }

  return {
    listTools: (_req, res) => {
      res.json({ tools: listToolMetadata(registry.listTools()) });
    },

    async executeChat(req, res) {
      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
      if (!payload) {
        return res.status(400).json({ error: "Mirror chat request must be an object" });
      }

      try {
        const policyContext = buildPolicyContext(req, payload);
        const correlation = {
          trace_id: String(policyContext.metadata?.trace_id),
          session_id: policyContext.session?.session_id,
        };
        res.setHeader("x-mirror-trace-id", correlation.trace_id);
        const adapterDescriptor = readIngressAdapterDescriptor(readIngressRoutePath(req));
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
        const policyContext = buildPolicyContext(req, payload);
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
    },

    async executeTool(req, res) {
      const toolNameParam = req.params.tool_name;
      if (typeof toolNameParam !== "string") {
        return res.status(400).json({ error: "Mirror tool name must be a string" });
      }

      const toolName = toolNameParam;
      const tool = registry.getTool(toolName);
      if (!tool) {
        return res.status(404).json({ error: `Unknown Mirror tool: ${toolName}` });
      }

      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const errors = validateMirrorToolInput(payload, tool.inputSchema);
      if (errors.length > 0) {
        return res.status(400).json({ error: "Invalid tool input", details: errors });
      }

      const policyContext = buildPolicyContext(req, payload);
      const correlation = {
        trace_id: String(policyContext.metadata?.trace_id),
        session_id: policyContext.session?.session_id,
      };

      try {
        res.setHeader("x-mirror-trace-id", correlation.trace_id);
        const adapterDescriptor = readIngressAdapterDescriptor(readIngressRoutePath(req));
        const actionId = crypto.randomUUID();
        const executionId = crypto.randomUUID();
        options.onRuntimeEvent?.(
          "tool.execution.started",
          withMirrorCorrelation(
            {
              tool: tool.metadata.name,
            },
            {
              trace_id: correlation.trace_id,
              session_id: correlation.session_id,
              action_id: actionId,
            },
          ),
        );
        incrementToolExecution(tool.metadata.name);
        logMirrorEvent("tool.execution", { tool: tool.metadata.name });
        logMirrorEvent("action.execution", { action: tool.metadata.name });
        options.onRuntimeEvent?.(
          "action.execution.started",
          withMirrorCorrelation(
            {
              action: tool.metadata.name,
              execution_id: executionId,
            },
            {
              trace_id: correlation.trace_id,
              session_id: correlation.session_id,
              action_id: actionId,
            },
          ),
        );
        recordWorkspaceToolObservability(tool.metadata.name);
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
                tool: tool.metadata.name,
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
              tool: tool.metadata.name,
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
              action: tool.metadata.name,
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
          tool: tool.metadata.name,
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
                tool: tool.metadata.name,
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
                tool: tool.metadata.name,
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
                action: tool.metadata.name,
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
              tool: tool.metadata.name,
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
              action: tool.metadata.name,
              error: error instanceof Error ? error.message : String(error),
            },
            {
              trace_id: String(policyContext.metadata?.trace_id),
              session_id: policyContext.session?.session_id,
            },
          ),
        );
        return res
          .status(500)
          .json({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createMirrorGatewayRouter(
  basePath = "/mirror",
  handlers: MirrorGatewayHandlers,
): express.Router {
  const router = express.Router();

  router.get(`${basePath}/tools`, handlers.listTools);
  router.post(`${basePath}/chat`, handlers.executeChat);
  router.post(`${basePath}/tools/:tool_name`, handlers.executeTool);

  return router;
}
