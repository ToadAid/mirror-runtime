import express from "express";
import {
  buildHttpChatAdapterEnvelope,
  buildHttpToolAdapterEnvelope,
  type MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import { incrementMetric, logMirrorEvent } from "../mirror-observability/index.js";
import { type MirrorPolicyContext } from "../mirror-policy/index.js";
import { type MirrorProviderConfig, type MirrorProviderPlane } from "../mirror-provider/index.js";
import { resolveMirrorTraceId } from "../mirror-runtime/index.js";
import {
  createMirrorToolRegistry,
  getMirrorNativeSkillTools,
  type MirrorSkillTool,
  type MirrorToolInputSchema,
} from "../mirror/skills/index.js";
import { readMirrorRequestToken } from "./auth.js";
import { executeMirrorGatewayChatRoute } from "./chat_route_runtime.js";
import { executeMirrorGatewayToolRoute } from "./tool_route_runtime.js";

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
      return await executeMirrorGatewayChatRoute(
        {
          buildPolicyContext,
          executeAdapterRequest: options.executeAdapterRequest,
          onRuntimeEvent: options.onRuntimeEvent,
          readIngressAdapterDescriptor,
          readIngressRoutePath,
        },
        req,
        res,
      );
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

      return await executeMirrorGatewayToolRoute(
        {
          buildPolicyContext,
          executeAdapterRequest: options.executeAdapterRequest,
          onRuntimeEvent: options.onRuntimeEvent,
          readIngressAdapterDescriptor,
          readIngressRoutePath,
          recordWorkspaceToolObservability,
          tool,
        },
        req,
        res,
      );
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
