import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeTelemetryEventIfEnabled } from "../runtime_sink.js";

const tempDirs: string[] = [];
const ORIGINAL_ENV = { ...process.env };

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  process.env.MIRROR_TELEMETRY_ENABLED = ORIGINAL_ENV.MIRROR_TELEMETRY_ENABLED;
  process.env.MIRROR_TELEMETRY_SINK_ENABLED = ORIGINAL_ENV.MIRROR_TELEMETRY_SINK_ENABLED;
  process.env.MIRROR_TELEMETRY_SINK_PATH = ORIGINAL_ENV.MIRROR_TELEMETRY_SINK_PATH;
});

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for sink file");
}

describe("writeTelemetryEventIfEnabled", () => {
  it("writes telemetry when sink is enabled", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-sink-"));
    tempDirs.push(dir);
    const sinkPath = path.join(dir, "mirror-telemetry.ndjson");

    process.env.MIRROR_TELEMETRY_ENABLED = "1";
    process.env.MIRROR_TELEMETRY_SINK_ENABLED = "1";
    process.env.MIRROR_TELEMETRY_SINK_PATH = sinkPath;

    writeTelemetryEventIfEnabled({
      stream: "telemetry",
      data: {
        type: "mirror.nudge",
        runId: "run-1",
        nudges: ["short nudge"],
        ts: 1,
      },
    });

    await waitFor(() => existsSync(sinkPath));
    const content = await fs.readFile(sinkPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}").type).toBe("mirror.nudge");
  });

  it("does nothing when sink is disabled", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-sink-disabled-"));
    tempDirs.push(dir);
    const sinkPath = path.join(dir, "mirror-telemetry.ndjson");

    delete process.env.MIRROR_TELEMETRY_ENABLED;
    delete process.env.MIRROR_TELEMETRY_SINK_ENABLED;
    process.env.MIRROR_TELEMETRY_SINK_PATH = sinkPath;

    writeTelemetryEventIfEnabled({
      stream: "telemetry",
      data: {
        type: "mirror.nudge",
        runId: "run-2",
        nudges: ["short nudge"],
        ts: 2,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(sinkPath)).toBe(false);
  });
});
