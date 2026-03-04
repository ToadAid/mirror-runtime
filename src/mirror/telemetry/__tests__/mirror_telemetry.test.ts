import { describe, expect, it } from "vitest";
import { buildMirrorNudgeTelemetryEvent } from "../mirror_telemetry.js";

describe("buildMirrorNudgeTelemetryEvent", () => {
  it("normalizes and limits nudges", () => {
    const event = buildMirrorNudgeTelemetryEvent({
      runId: "run-1",
      nudges: ["  first   nudge\nwith   spaces  ", "second nudge", "third nudge", "fourth nudge"],
    });

    expect(event.type).toBe("mirror.nudge");
    expect(event.runId).toBe("run-1");
    expect(event.nudges).toEqual(["first nudge with spaces", "second nudge", "third nudge"]);
    expect(typeof event.ts).toBe("number");
  });

  it("truncates long nudge entries", () => {
    const event = buildMirrorNudgeTelemetryEvent({
      nudges: ["x".repeat(300)],
    });

    expect(event.nudges[0]?.length).toBeLessThanOrEqual(140);
    expect(event.nudges[0]?.endsWith("…")).toBe(true);
  });
});
