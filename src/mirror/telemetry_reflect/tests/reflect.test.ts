import { describe, expect, it } from "vitest";
import { formatReflectSummary, summarizeReflectEvents } from "../reflect.js";

describe("telemetry_reflect summary", () => {
  it("summarizes counts, top nudges, and latest runs", () => {
    const summary = summarizeReflectEvents(
      [
        {
          stream: "telemetry",
          data: {
            type: "mirror.nudge",
            ts: 2_000,
            runId: "run-2",
            nudges: ["branch sync", "branch sync", "  lots   of    spaces   ", "extra"],
          },
        },
        {
          stream: "telemetry",
          data: {
            type: "mirror.nudge",
            ts: 1_000,
            runId: "run-1",
            nudges: ["branch sync", "another"],
          },
        },
      ],
      { windowMinutes: 60, type: "mirror.nudge", limit: 200 },
    );

    expect(summary.totalEventsScanned).toBe(2);
    expect(summary.totalNudges).toBe(5); // max 3 nudges/event applies to first event
    expect(summary.uniqueRunIds).toBe(2);
    expect(summary.topNudges[0]).toEqual({ nudge: "branch sync", count: 3 });
    expect(summary.latestRunIds[0]?.runId).toBe("run-2");
    expect(summary.latestRunIds[0]?.nudgeCount).toBe(3);
  });

  it("normalizes whitespace and truncates long nudges", () => {
    const longNudge = `${"x".repeat(150)}   tail`;
    const summary = summarizeReflectEvents(
      [
        {
          stream: "telemetry",
          data: {
            type: "mirror.nudge",
            ts: 123,
            runId: "run-a",
            nudges: ["  alpha   beta  ", longNudge],
          },
        },
      ],
      { windowMinutes: 60, type: "mirror.nudge", limit: 200 },
    );

    expect(summary.topNudges[0]?.nudge).toBe("alpha beta");
    expect(summary.topNudges[1]?.nudge.length).toBe(140);
  });

  it("formats summary with expected sections", () => {
    const text = formatReflectSummary({
      windowMinutes: 30,
      runId: "run-9",
      type: "mirror.nudge",
      limit: 100,
      totalEventsScanned: 4,
      totalNudges: 7,
      uniqueRunIds: 2,
      topNudges: [{ nudge: "branch sync", count: 4 }],
      latestRunIds: [{ runId: "run-9", lastSeenTs: Date.UTC(2026, 2, 5, 10, 0, 0), nudgeCount: 5 }],
    });

    expect(text).toContain("🪞 mirror.reflect");
    expect(text).toContain("window: since=30m runId=run-9 limit=100 type=mirror.nudge");
    expect(text).toContain("- total events scanned: 4");
    expect(text).toContain("top repeated nudges:");
    expect(text).toContain("latest runIds:");
    expect(text.endsWith("\n\n")).toBe(true);
  });
});
