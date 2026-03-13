import { describe, expect, it } from "vitest";
import { createMirrorPolicyEngine } from "../mirror-policy/index.js";
import type { MirrorSkillTool } from "../mirror/skills/index.js";
import {
  createMirrorActionRuntime,
  createMirrorActionsFromTools,
  createMirrorToolRegistryFromActionRuntime,
} from "./index.js";

function createTool(name: string, access: "open" | "operator" = "open"): MirrorSkillTool {
  return {
    metadata: {
      name,
      description: `${name} description`,
      version: "1.0.0",
      access,
    },
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
    },
    async execute(input) {
      return { echoed: input.value };
    },
  };
}

describe("mirror action runtime", () => {
  it("bridges existing tools into action descriptors", () => {
    const actions = createMirrorActionsFromTools([createTool("mirror.echo")]);

    expect(actions[0]?.descriptor.action_name).toBe("mirror.echo");
    expect(actions[0]?.descriptor.source).toBe("tool_bridge");
    expect(actions[0]?.descriptor.compatibility?.tool_name).toBe("mirror.echo");
  });

  it("executes actions with explicit lifecycle events", async () => {
    const runtime = createMirrorActionRuntime(
      createMirrorActionsFromTools([createTool("mirror.echo")]),
    );
    const seen: string[] = [];

    const result = await runtime.executeAction(
      {
        action_name: "mirror.echo",
        input: { value: "ok" },
      },
      {
        onLifecycleEvent(event) {
          seen.push(event.type);
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.result.echoed).toBe("ok");
    expect(seen).toEqual(["started", "finished"]);
  });

  it("evaluates operator access through the policy engine", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const runtime = createMirrorActionRuntime(
      createMirrorActionsFromTools([createTool("mirror.commit-scroll", "operator")]),
    );

    await expect(
      runtime.executeAction({
        action_name: "mirror.commit-scroll",
        input: { value: "draft" },
        context: {
          surface: "service",
        },
        policy: createMirrorPolicyEngine(),
      }),
    ).rejects.toThrow("Mirror operator authorization required");
  });

  it("provides a compatibility tool registry backed by the action runtime", async () => {
    const runtime = createMirrorActionRuntime(
      createMirrorActionsFromTools([createTool("mirror.echo")]),
    );
    const registry = createMirrorToolRegistryFromActionRuntime(runtime);
    const result = await registry.executeTool("mirror.echo", { value: "ok" });

    expect(registry.getTool("mirror.echo")?.metadata.name).toBe("mirror.echo");
    expect(result.echoed).toBe("ok");
  });
});
