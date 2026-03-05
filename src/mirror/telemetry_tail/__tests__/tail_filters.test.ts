import { describe, expect, it, vi } from "vitest";
import { buildTelemetryFilter } from "../tail.js";

describe("buildTelemetryFilter", () => {
  it("filters by --since minutes using ts", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-05T12:00:00.000Z"));

      const filter = buildTelemetryFilter({
        sinceMinutes: 10,
        now: () => Date.now(),
      });

      expect(
        filter({ type: "mirror.nudge", runId: "new", nudges: ["ok"], ts: Date.now() - 60_000 }),
      ).toBe(true);
      expect(
        filter({
          type: "mirror.nudge",
          runId: "old",
          nudges: ["old"],
          ts: Date.now() - 11 * 60_000,
        }),
      ).toBe(false);
      expect(filter({ type: "mirror.nudge", runId: "missing", nudges: ["x"] })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters by --grep against nudges", () => {
    const filter = buildTelemetryFilter({ grep: "branch" });

    expect(filter({ type: "mirror.nudge", nudges: ["Switch branch now"], ts: 1 })).toBe(true);
    expect(filter({ type: "mirror.nudge", nudges: ["no match"], ts: 1 })).toBe(false);
    expect(filter({ type: "mirror.nudge", runId: "run-1", ts: 1 })).toBe(false);
  });

  it("filters by --type for mirror and non-mirror events", () => {
    const mirrorOnly = buildTelemetryFilter({ type: "mirror.nudge" });
    expect(mirrorOnly({ type: "mirror.nudge", nudges: ["n"], ts: 1 })).toBe(true);
    expect(mirrorOnly({ type: "mirror.other", nudges: ["n"], ts: 1 })).toBe(false);

    const otherType = buildTelemetryFilter({ type: "mirror.other" });
    expect(otherType({ type: "mirror.other", runId: "run-o", ts: 1 })).toBe(true);
    expect(otherType({ type: "mirror.nudge", runId: "run-n", ts: 1 })).toBe(false);
  });
});
