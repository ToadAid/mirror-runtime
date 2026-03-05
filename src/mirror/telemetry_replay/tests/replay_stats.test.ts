import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseTelemetryEvent,
  replayTelemetry,
  summarizeMirrorNudges,
  summarizeTelemetry,
} from "../index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function writeTempNdjson(lines: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-replay-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "telemetry.ndjson");
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return filePath;
}

describe("telemetry replay + stats", () => {
  it("reads file and keeps only valid JSON events", async () => {
    const filePath = await writeTempNdjson([
      "{bad-json",
      JSON.stringify({ type: "mirror.nudge", runId: "run-1", nudges: ["a"], ts: 1 }),
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", nudges: ["b"], ts: 2 } }),
    ]);

    const events = await replayTelemetry({ path: filePath, type: "mirror.nudge", limit: 200 });
    expect(events).toHaveLength(2);
    expect(events[0]?.data.type).toBe("mirror.nudge");
    expect(parseTelemetryEvent("{bad")).toBeNull();
  });

  it("applies since filter using ts", async () => {
    const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0);
    const filePath = await writeTempNdjson([
      JSON.stringify({ type: "mirror.nudge", nudges: ["old"], ts: nowMs - 31 * 60_000 }),
      JSON.stringify({ type: "mirror.nudge", nudges: ["new"], ts: nowMs - 5 * 60_000 }),
    ]);

    const events = await replayTelemetry({
      path: filePath,
      sinceMinutes: 30,
      now: () => nowMs,
      type: "mirror.nudge",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.data.nudges).toEqual(["new"]);
  });

  it("applies grep filter against nudges", async () => {
    const filePath = await writeTempNdjson([
      JSON.stringify({ type: "mirror.nudge", nudges: ["switch branch now"], ts: 1 }),
      JSON.stringify({ type: "mirror.nudge", nudges: ["no match here"], ts: 2 }),
    ]);

    const events = await replayTelemetry({
      path: filePath,
      grep: "BRANCH",
      type: "mirror.nudge",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.data.nudges).toEqual(["switch branch now"]);
  });

  it("applies type filter by data.type", async () => {
    const filePath = await writeTempNdjson([
      JSON.stringify({ type: "mirror.nudge", nudges: ["a"], ts: 1 }),
      JSON.stringify({ type: "mirror.other", nudges: ["b"], ts: 2 }),
    ]);

    const events = await replayTelemetry({
      path: filePath,
      type: "mirror.other",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.data.type).toBe("mirror.other");
  });

  it("returns telemetry stats summary", async () => {
    const filePath = await writeTempNdjson([
      JSON.stringify({ type: "mirror.nudge", nudges: ["n1"], ts: 10 }),
      JSON.stringify({ type: "mirror.nudge", nudges: ["n2"], ts: 20 }),
      JSON.stringify({ type: "mirror.other", nudges: ["x"], ts: 15 }),
    ]);

    const events = await replayTelemetry({ path: filePath, type: "", limit: 200 });
    const summary = summarizeTelemetry(events);
    const nudgeSummary = summarizeMirrorNudges(events);

    expect(summary.total).toBe(3);
    expect(summary.byType["mirror.nudge"]).toBe(2);
    expect(summary.byType["mirror.other"]).toBe(1);
    expect(summary.lastTs).toBe(20);

    expect(nudgeSummary.count).toBe(2);
    expect(nudgeSummary.lastTs).toBe(20);
    expect(nudgeSummary.sampleNudges).toEqual(["n1", "n2"]);
  });
});
