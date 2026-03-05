import { describe, expect, it } from "vitest";
import { formatMirrorNudgeTelemetry, isMirrorNudgeTelemetry } from "../mirror_nudge_observer.js";

describe("mirror_nudge_observer", () => {
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

    expect(
      isMirrorNudgeTelemetry({
        stream: "telemetry",
        data: {
          type: "other.event",
          runId: "run-1",
          nudges: ["nudge 1"],
          ts: 1_738_989_400_000,
        },
      }),
    ).toBe(false);

    expect(
      isMirrorNudgeTelemetry({
        stream: "mirror_nudge",
        data: {
          type: "mirror.nudge",
          runId: "run-1",
          nudges: ["nudge 1"],
          ts: 1_738_989_400_000,
        },
      }),
    ).toBe(false);
  });

  it("formats telemetry with expected lines", () => {
    const output = formatMirrorNudgeTelemetry({
      stream: "telemetry",
      data: {
        type: "mirror.nudge",
        runId: "run-123",
        nudges: ["first nudge", "second nudge"],
        ts: Date.UTC(2026, 2, 5, 14, 30, 0),
      },
    });

    expect(output).toContain("🪞 mirror.nudge");
    expect(output).toContain("runId: run-123");
    expect(output).toContain("ts: 2026-03-05T14:30:00.000Z");
    expect(output).toContain("- first nudge");
    expect(output).toContain("- second nudge");
    expect(output.endsWith("\n\n")).toBe(true);
  });
});
