import { describe, expect, it } from "vitest";
import { getBuiltinMirrorSkills } from "../discover.js";
import { createMirrorSkillRegistry } from "../registry.js";
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
});
