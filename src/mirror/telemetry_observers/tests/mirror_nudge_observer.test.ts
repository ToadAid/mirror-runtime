import { describe, expect, it } from "vitest";
import { formatMirrorNudgeTelemetry, isMirrorNudgeTelemetry } from "../mirror_nudge_observer.js";

describe("mirror_nudge_observer (compat path)", () => {
  it("filters mirror.nudge telemetry events", () => {
    expect(
      isMirrorNudgeTelemetry({
        stream: "telemetry",
        data: {
          type: "mirror.nudge",
          runId: "run-1",
          nudges: ["nudge 1"],
          ts: 1_738_989_400_000,
        },
      }),
    ).toBe(true);
  });

  it("formats telemetry", () => {
    const output = formatMirrorNudgeTelemetry({
      stream: "telemetry",
      data: {
        type: "mirror.nudge",
        runId: "run-123",
        nudges: ["first nudge"],
        ts: Date.UTC(2026, 2, 5, 14, 30, 0),
      },
    });

    expect(output).toContain("🪞 mirror.nudge");
    expect(output).toContain("runId: run-123");
  });
});
