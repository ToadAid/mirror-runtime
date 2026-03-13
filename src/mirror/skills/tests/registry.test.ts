import { describe, expect, it } from "vitest";
import { getBuiltinMirrorSkills } from "../discover.js";
import {
  createMirrorSkillRegistry,
  createMirrorToolRegistry,
  getMirrorNativeSkillTools,
} from "../registry/index.js";
import type { MirrorSkill } from "../types.js";

function createTestSkill(name: string): MirrorSkill {
  return {
    meta: {
      name,
      description: "test skill",
      version: "1.0.0",
    },
    async run(input: Record<string, unknown>) {
      return { input };
    },
  };
}

describe("mirror skill registry", () => {
  it("registers one skill and retrieves it by name", () => {
    const registry = createMirrorSkillRegistry();
    const skill = createTestSkill("mirror.test");

    registry.registerSkill(skill);

    expect(registry.getSkill("mirror.test")).toBe(skill);
  });

  it("rejects duplicate skill names", () => {
    const registry = createMirrorSkillRegistry();
    const first = createTestSkill("mirror.test");
    const duplicate = createTestSkill("mirror.test");

    registry.registerSkill(first);

    expect(() => registry.registerSkill(duplicate)).toThrow("Mirror skill already registered");
  });

  it("listSkills includes the built-in skill", () => {
    const registry = createMirrorSkillRegistry();

    for (const skill of getBuiltinMirrorSkills()) {
      registry.registerSkill(skill);
    }

    expect(registry.listSkills().map((skill) => skill.meta.name)).toContain("mirror.echo");
  });

  it("built-in echo skill runs successfully", async () => {
    const [echo] = getBuiltinMirrorSkills();
    expect(echo).toBeDefined();

    const result = await echo.run({ text: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("exposes mirror-native skill tools with metadata and schema", () => {
    const tools = getMirrorNativeSkillTools();
    const names = tools.map((tool) => tool.metadata.name);

    expect(names).toContain("mirror.find-scroll");
    expect(names).toContain("mirror.canon-fact");
    expect(names).toContain("mirror.forge-scroll");
    expect(names).toContain("mirror.commit-scroll");
    expect(names).toContain("mirror.interpret-tweet");
    expect(names).toContain("mirror.task.create");
    expect(names).toContain("mirror.reminder.due");
    expect(names).toContain("mirror.heartbeat.evaluate");
    expect(names).toContain("mirror.monk.context");
    expect(names).toContain("mirror.monk.resume");
    expect(tools[0]?.inputSchema.type).toBe("object");
    expect(tools.find((tool) => tool.metadata.name === "mirror.find-scroll")?.metadata.access).toBe(
      "open",
    );
    expect(
      tools.find((tool) => tool.metadata.name === "mirror.commit-scroll")?.metadata.access,
    ).toBe("operator");
  });

  it("routes tool calls to the correct mirror-native module", async () => {
    const registry = createMirrorToolRegistry([
      {
        metadata: {
          name: "mirror.test-tool",
          description: "test tool",
          version: "1.0.0",
          access: "open",
        },
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
        },
        async execute(input: Record<string, unknown>) {
          return { echoed: input.value };
        },
      },
    ]);

    const result = await registry.executeTool("mirror.test-tool", { value: "ok" });
    expect(result).toEqual({ echoed: "ok" });
  });
});
