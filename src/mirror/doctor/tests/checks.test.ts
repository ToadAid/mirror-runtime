import { describe, expect, it } from "vitest";
import { runMirrorDoctorChecks } from "../index.js";

describe("mirror doctor checks", () => {
  it("detects Mirror-native identity env keys only", async () => {
    const checks = await runMirrorDoctorChecks({
      env: {
        MIRROR_AGENT_ID: "mirror-agent",
        MIRROR_RUN_ID: "mirror-run",
      },
    });

    const agentCheck = checks.find((check) => check.key === "identity.agentId");
    const runCheck = checks.find((check) => check.key === "identity.runId");

    expect(agentCheck?.status).toBe("PASS");
    expect(agentCheck?.details).toEqual({ agentId: "mirror-agent" });
    expect(runCheck?.status).toBe("PASS");
    expect(runCheck?.details).toEqual({ runId: "mirror-run" });
  });

  it("ignores OpenClaw compatibility identity env keys", async () => {
    const checks = await runMirrorDoctorChecks({
      env: {
        OPENCLAW_AGENT_ID: "legacy-agent",
        OPENCLAW_AGENT: "legacy-short-agent",
        OPENCLAW_RUN_ID: "legacy-run",
      },
    });

    const agentCheck = checks.find((check) => check.key === "identity.agentId");
    const runCheck = checks.find((check) => check.key === "identity.runId");

    expect(agentCheck?.status).toBe("WARN");
    expect(agentCheck?.details).toBeUndefined();
    expect(runCheck?.status).toBe("WARN");
    expect(runCheck?.details).toBeUndefined();
  });
});
