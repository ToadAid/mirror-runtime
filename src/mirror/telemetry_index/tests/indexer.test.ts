import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { indexTelemetryFile } from "../indexer.js";
import {
  countEventsByType,
  getEventsByType,
  getEventsSince,
  getLastEvent,
  getRecentEvents,
} from "../query.js";

const tempDirs: string[] = [];
const previousPrivacyBoundaryFlag = process.env.MIRROR_PRIVACY_BOUNDARY_ENABLED;

afterEach(async () => {
  if (previousPrivacyBoundaryFlag === undefined) {
    delete process.env.MIRROR_PRIVACY_BOUNDARY_ENABLED;
  } else {
    process.env.MIRROR_PRIVACY_BOUNDARY_ENABLED = previousPrivacyBoundaryFlag;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createFixture(lines: string[]): Promise<{ sourcePath: string; dbPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-index-"));
  tempDirs.push(dir);
  const sourcePath = path.join(dir, "telemetry.ndjson");
  const dbPath = path.join(dir, "telemetry.sqlite");
  await fs.writeFile(sourcePath, `${lines.join("\n")}\n`, "utf8");
  return { sourcePath, dbPath };
}

describe("telemetry sqlite indexer", () => {
  it("indexes valid events", async () => {
    const { sourcePath, dbPath } = await createFixture([
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 10, runId: "run-1" },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 11, runId: "run-2" },
      }),
    ]);

    const indexed = await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });
    expect(indexed).toBe(2);
    expect(getRecentEvents(10, dbPath)).toHaveLength(2);
  });

  it("ignores malformed JSON", async () => {
    const { sourcePath, dbPath } = await createFixture([
      "{bad-json",
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 20, runId: "run-1" },
      }),
    ]);

    const indexed = await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });
    expect(indexed).toBe(1);
    expect(getRecentEvents(10, dbPath)).toHaveLength(1);
  });

  it("rebuild wipes previous rows", async () => {
    const { sourcePath, dbPath } = await createFixture([
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 30, runId: "run-1" },
      }),
    ]);

    await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });
    await indexTelemetryFile({ sourcePath, dbPath, rebuild: false });
    expect(getRecentEvents(10, dbPath)).toHaveLength(2);

    await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });
    expect(getRecentEvents(10, dbPath)).toHaveLength(1);
  });

  it("query helpers return expected results", async () => {
    const { sourcePath, dbPath } = await createFixture([
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 40, runId: "run-1" },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.other", ts: 50, runId: "run-2" },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 60, runId: "run-3" },
      }),
    ]);

    await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });

    expect(getEventsByType("mirror.nudge", 10, dbPath)).toHaveLength(2);
    expect(getEventsSince(50, dbPath)).toHaveLength(2);
    expect(countEventsByType(dbPath)).toEqual([
      { type: "mirror.nudge", count: 2 },
      { type: "mirror.other", count: 1 },
    ]);
  });

  it("returns events ordered by timestamp", async () => {
    const { sourcePath, dbPath } = await createFixture([
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 100, runId: "run-1" },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 300, runId: "run-3" },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", ts: 200, runId: "run-2" },
      }),
    ]);

    await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });

    const recent = getRecentEvents(3, dbPath);
    expect(recent.map((row) => row.ts)).toEqual([300, 200, 100]);

    const last = getLastEvent(dbPath);
    expect(last?.ts).toBe(300);
  });

  it("removes human-identifiable fields from payload_json when privacy boundary is enabled", async () => {
    process.env.MIRROR_PRIVACY_BOUNDARY_ENABLED = "1";
    const { sourcePath, dbPath } = await createFixture([
      JSON.stringify({
        stream: "telemetry",
        data: {
          type: "mirror.nudge",
          ts: 101,
          runId: "run-privacy",
          humanName: "Tommy",
          nudges: ["safe"],
        },
      }),
    ]);

    await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });

    const rows = getRecentEvents(1, dbPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload_json).not.toContain("Tommy");
    const payload = JSON.parse(rows[0]?.payload_json ?? "{}") as {
      data?: Record<string, unknown>;
    };
    expect(payload.data).toBeDefined();
    expect(payload.data).not.toHaveProperty("humanName");
  });
});
