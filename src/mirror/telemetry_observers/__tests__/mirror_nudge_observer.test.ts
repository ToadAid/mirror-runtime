import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { processMirrorTelemetryObserverLine } from "../cli.js";
import { formatMirrorNudgeTelemetry, isMirrorNudgeTelemetry } from "../mirror_nudge_observer.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

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

  it("writes sink file when enabled while processing a single line", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-observer-"));
    tempDirs.push(tempDir);
    const sinkPath = path.join(tempDir, "mirror-telemetry.ndjson");

    const line = JSON.stringify({
      stream: "telemetry",
      data: {
        type: "mirror.nudge",
        runId: " run-abc ",
        nudges: ["  first   nudge\nwith spaces  "],
        ts: 123,
      },
    });

    await processMirrorTelemetryObserverLine(line, {
      env: {
        MIRROR_TELEMETRY_SINK_ENABLED: "1",
        MIRROR_TELEMETRY_SINK_PATH: sinkPath,
      },
      stdoutWrite: () => {},
      stdoutLine: () => {},
      warn: () => {},
    });

    const content = await fs.readFile(sinkPath, "utf8");
    const parsed = JSON.parse(content.trim()) as {
      type: string;
      runId?: string;
      nudges?: string[];
      ts?: number;
    };
    expect(parsed.type).toBe("mirror.nudge");
    expect(parsed.runId).toBe("run-abc");
    expect(parsed.nudges).toEqual(["first nudge with spaces"]);
    expect(parsed.ts).toBe(123);
  });
});
