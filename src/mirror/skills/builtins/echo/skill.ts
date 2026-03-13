// Archived builtin retained for skill-engine tests only.
// This is not part of the canonical standalone Mirror product surface.
import type { MirrorSkill } from "../../types.js";

export const mirrorEchoSkill: MirrorSkill = {
  meta: {
    name: "mirror.echo",
    description: "Echo input text for skill-engine wiring tests",
    version: "1.0.0",
    inputs: ["text"],
    outputs: ["echoed"],
  },
  async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = input.text;
    if (typeof text !== "string") {
      throw new TypeError("mirror.echo requires input.text to be a string");
    }
    return { echoed: text };
  },
};
