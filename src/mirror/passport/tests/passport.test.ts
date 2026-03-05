import { describe, expect, it } from "vitest";
import { formatMirrorPassport } from "../format.js";
import { buildMirrorPassport } from "../passport.js";

describe("mirror passport", () => {
  it("omits traveler identity by default", () => {
    const passport = buildMirrorPassport({
      env: {
        MIRROR_AGENT_ID: "agent-1",
        MIRROR_RUN_ID: "run-1",
        MIRROR_TRAVELER_NAME: "Tommy Traveler",
      },
      now: new Date("2026-03-05T12:00:00.000Z"),
      hostName: "host-a",
      cwd: "/tmp/test",
    });

    expect(passport.localOnly).toBeUndefined();
    const output = formatMirrorPassport(passport);
    expect(output).toContain("agentId: agent-1");
    expect(output).toContain("runId: run-1");
    expect(output).not.toContain("travelerName");
    expect(output).not.toContain("Tommy Traveler");
  });

  it("includes local fields only when include-local is enabled", () => {
    const passport = buildMirrorPassport({
      includeLocal: true,
      env: {
        MIRROR_AGENT_ID: "agent-2",
        MIRROR_TRAVELER_NAME: "Tommy Traveler",
      },
      now: new Date("2026-03-05T12:00:00.000Z"),
      hostName: "host-b",
      cwd: "/tmp/local",
    });

    expect(passport.localOnly).toBeDefined();
    expect(passport.localOnly?.travelerName).toBe("Tommy Traveler");

    const output = formatMirrorPassport(passport);
    expect(output).toContain("LOCAL ONLY");
    expect(output).toContain("travelerName: Tommy Traveler");
    expect(output).toContain("hostName: host-b");
  });
});
