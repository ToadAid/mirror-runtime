import express from "express";
import {
  incrementMetric,
  incrementToolExecution,
  logMirrorEvent,
} from "../mirror-observability/index.js";
import type { FetchLike, MirrorProviderConfig } from "../mirror-provider/index.js";
import { executeMirrorChatWithProvider } from "../mirror-runtime/index.js";
import {
  createMirrorToolRegistry,
  getMirrorNativeSkillTools,
  type MirrorSkillTool,
  type MirrorToolInputSchema,
} from "../mirror/skills/index.js";
import { authorizeMirrorToolRequest } from "./auth.js";

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
    fetchImpl?: FetchLike;
  } = {},
): MirrorGatewayHandlers {
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

  return {
    listTools: (_req, res) => {
      res.json({ tools: listToolMetadata(registry.listTools()) });
    },

    async executeChat(req, res) {
      if (!options.provider) {
        return res.status(503).json({ error: "Mirror provider is not configured" });
      }
      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
      if (!payload) {
        return res.status(400).json({ error: "Mirror chat request must be an object" });
      }

      try {
        incrementMetric("chat_requests");
        logMirrorEvent("chat.pipeline", { route: "mirror.chat" });
        const response = await executeMirrorChatWithProvider(payload as never, {
          provider: options.provider,
          fetchImpl: options.fetchImpl,
        });
        return res.json({ response });
      } catch (error) {
        return res.status(500).json({ error: String(error) });
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

      const auth = authorizeMirrorToolRequest(req, tool);
      if (!auth.allowed) {
        return res.status(auth.statusCode ?? 403).json({ error: auth.error });
      }

      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const errors = validateMirrorToolInput(payload, tool.inputSchema);
      if (errors.length > 0) {
        return res.status(400).json({ error: "Invalid tool input", details: errors });
      }

      try {
        incrementToolExecution(tool.metadata.name);
        logMirrorEvent("tool.execution", { tool: tool.metadata.name });
        recordWorkspaceToolObservability(tool.metadata.name);
        const result = await registry.executeTool(toolName, payload);
        return res.json({
          tool: tool.metadata.name,
          result,
        });
      } catch (error) {
        return res.status(500).json({ error: String(error) });
      }
    },
  };
}

export function createMirrorGatewayRouter(
  basePath = "/mirror",
  handlers = createMirrorGatewayHandlers(),
): express.Router {
  const router = express.Router();

  router.get(`${basePath}/tools`, handlers.listTools);
  router.post(`${basePath}/chat`, handlers.executeChat);
  router.post(`${basePath}/tools/:tool_name`, handlers.executeTool);

  return router;
}
