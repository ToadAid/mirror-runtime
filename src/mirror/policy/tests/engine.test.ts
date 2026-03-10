import { describe, expect, it } from "vitest";
import { evaluateToolPolicy } from "../engine.js";
import { evaluateMirrorForgeToolRunnerPolicy, evaluateMirrorToolRunnerPolicy } from "../runners.js";

describe("mirror policy engine", () => {
  it("allows safe tools", () => {
    const decision = evaluateToolPolicy({
      tool_name: "onchain.read",
      risk_tier: "safe",
      caller_agent: "agent-a",
    });
    expect(decision.decision).toBe("allow");
    expect(decision.risk_tier).toBe("safe");
  });

  it("requires approval for dangerous tools", () => {
    const decision = evaluateToolPolicy({
      tool_name: "exec",
      risk_tier: "dangerous",
      caller_agent: "agent-a",
    });
    expect(decision.decision).toBe("require_approval");
    expect(decision.risk_tier).toBe("dangerous");
  });

  it("denies concrete forbidden tools in v0", () => {
    const decision = evaluateToolPolicy({
      tool_name: "onchain.write",
      caller_agent: "agent-a",
    });
    expect(decision.decision).toBe("deny");
    expect(decision.risk_tier).toBe("forbidden");
  });

  it("keeps runner adapters consistent", () => {
    const mirrorTool = evaluateMirrorToolRunnerPolicy({
      toolName: "apply_patch",
      callerAgent: "agent-a",
    });
    const mirrorForge = evaluateMirrorForgeToolRunnerPolicy({
      toolName: "apply_patch",
      callerAgent: "agent-a",
    });
    expect(mirrorForge).toEqual(mirrorTool);
    expect(mirrorTool.decision).toBe("require_approval");
  });
});
