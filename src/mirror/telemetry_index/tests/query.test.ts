import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { indexTelemetryFile } from "../indexer.js";
import { parseIndexedPayload, queryTelemetryEvents } from "../query.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setupIndex(lines: string[]): Promise<{ sourcePath: string; dbPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-query-"));
  tempDirs.push(dir);
  const sourcePath = path.join(dir, "telemetry.ndjson");
  const dbPath = path.join(dir, "telemetry.sqlite");
  await fs.writeFile(sourcePath, `${lines.join("\n")}\n`, "utf8");
  await indexTelemetryFile({ sourcePath, dbPath, rebuild: true });
  return { sourcePath, dbPath };
}

describe("queryTelemetryEvents", () => {
  it("filters by type + since + run_id", async () => {
    const now = Date.UTC(2026, 2, 5, 12, 0, 0);
    const { dbPath } = await setupIndex([
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", runId: "run-1", ts: now - 90_000, nudges: ["a"] },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.nudge", runId: "run-2", ts: now - 20_000, nudges: ["b"] },
      }),
      JSON.stringify({
        stream: "telemetry",
        data: { type: "mirror.other", runId: "run-2", ts: now - 10_000, nudges: ["c"] },
      }),
    ]);

    const rows = queryTelemetryEvents(
      {
        type: "mirror.nudge",
        runId: "run-2",
        sinceTs: now - 30_000,
        limit: 50,
      },
      dbPath,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("mirror.nudge");
    expect(rows[0]?.run_id).toBe("run-2");
  });

  it("applies limit", async () => {
    const { dbPath } = await setupIndex([
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r1", ts: 1 } }),
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r2", ts: 2 } }),
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r3", ts: 3 } }),
    ]);

    const rows = queryTelemetryEvents({ type: "mirror.nudge", limit: 2 }, dbPath);
    expect(rows).toHaveLength(2);
  });

  it("orders rows by ts DESC", async () => {
    const { dbPath } = await setupIndex([
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r1", ts: 100 } }),
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r3", ts: 300 } }),
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r2", ts: 200 } }),
    ]);

    const rows = queryTelemetryEvents({ type: "mirror.nudge", limit: 10 }, dbPath);
    expect(rows.map((row) => row.ts)).toEqual([300, 200, 100]);
  });

  it("handles bad payload_json safely", async () => {
    const { dbPath } = await setupIndex([
      JSON.stringify({ stream: "telemetry", data: { type: "mirror.nudge", runId: "r1", ts: 1 } }),
    ]);

    // Corrupt one row payload_json after indexing; query helper must not throw when parsing.
    const { openTelemetryIndexDb } = await import("../db.js");
    const db = openTelemetryIndexDb({ dbPath });
    db.prepare("UPDATE events SET payload_json = ? WHERE id = ?").run("{bad-json", 1);
    db.close();

    const rows = queryTelemetryEvents({ type: "mirror.nudge", limit: 10 }, dbPath);
    expect(rows).toHaveLength(1);
    expect(() => parseIndexedPayload(rows[0])).not.toThrow();
    expect(parseIndexedPayload(rows[0])).toBeNull();
  });
});
