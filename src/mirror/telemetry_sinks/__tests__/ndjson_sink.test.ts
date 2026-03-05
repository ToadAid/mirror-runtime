import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTelemetrySinkEvent } from "../ndjson_sink.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("ndjson_sink", () => {
  it("appends events as NDJSON lines", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-sink-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sink.ndjson");

    await appendTelemetrySinkEvent({
      filePath,
      event: {
        type: "mirror.nudge",
        runId: "run-1",
        nudges: ["first nudge"],
        ts: 1,
      },
    });

    await appendTelemetrySinkEvent({
      filePath,
      event: {
        type: "mirror.nudge",
        runId: "run-2",
        nudges: ["second nudge"],
        ts: 2,
      },
    });

    const content = await fs.readFile(filePath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "mirror.nudge",
      runId: "run-1",
      nudges: ["first nudge"],
      ts: 1,
    });
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({
      type: "mirror.nudge",
      runId: "run-2",
      nudges: ["second nudge"],
      ts: 2,
    });
  });
});
