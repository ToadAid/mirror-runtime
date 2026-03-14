import type { MirrorSkillTool, MirrorToolRegistry } from "../mirror/skills/index.js";
import type { MirrorAction, MirrorActionRuntime } from "./action_types.js";

export function createMirrorActionsFromTools(tools: MirrorSkillTool[]): MirrorAction[] {
  return tools.map((tool) => ({
    descriptor: {
      action_name: tool.metadata.name,
      description: tool.metadata.description,
      version: tool.metadata.version,
      access: tool.metadata.access,
      source: "tool_bridge",
      input_schema: tool.inputSchema,
      execution: {
        provider_usage: "none",
      },
      compatibility: {
        tool_name: tool.metadata.name,
      },
    },
    execute: (input) => tool.execute(input),
  }));
}

export function createMirrorToolRegistryFromActionRuntime(
  runtime: MirrorActionRuntime,
): MirrorToolRegistry {
  return {
    registerTool(tool) {
      runtime.registerAction(createMirrorActionsFromTools([tool])[0]);
    },
    getTool(name) {
      const action = runtime.getAction(name);
      if (!action) {
        return undefined;
      }
      return {
        metadata: {
          name: action.descriptor.compatibility?.tool_name ?? action.descriptor.action_name,
          description: action.descriptor.description,
          version: action.descriptor.version,
          access: action.descriptor.access,
        },
        inputSchema: action.descriptor.input_schema,
        async execute(input) {
          const result = await runtime.executeAction({
            action_name: action.descriptor.action_name,
            input,
          });
          return result.result;
        },
      };
    },
    listTools() {
      return runtime.listActions().map((action) => ({
        metadata: {
          name: action.descriptor.compatibility?.tool_name ?? action.descriptor.action_name,
          description: action.descriptor.description,
          version: action.descriptor.version,
          access: action.descriptor.access,
        },
        inputSchema: action.descriptor.input_schema,
        async execute(input) {
          const result = await runtime.executeAction({
            action_name: action.descriptor.action_name,
            input,
          });
          return result.result;
        },
      }));
    },
    async executeTool(name, input) {
      const result = await runtime.executeAction({
        action_name: name,
        input,
      });
      return result.result;
    },
  };
}
