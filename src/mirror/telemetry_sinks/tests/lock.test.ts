import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTelemetrySinkEvent } from "../ndjson_sink.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-lock-"));
  tempDirs.push(dir);
  return dir;
}

describe("telemetry sink lock", () => {
  it("lock blocks second writer", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "sink.ndjson");
    const lockPath = `${filePath}.lock`;
    await fs.writeFile(lockPath, "held", "utf8");

    await expect(
      appendTelemetrySinkEvent({
        filePath,
        event: {
          type: "mirror.nudge",
          runId: "run-1",
          nudges: ["first"],
          ts: 1,
        },
        lockEnabled: true,
        lockPath,
        lockTimeoutMs: 50,
        lockPollMs: 10,
      }),
    ).rejects.toHaveProperty("code", "ELOCKTIMEOUT");
  });

  it("lock allows write after release", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "sink.ndjson");
    const lockPath = `${filePath}.lock`;
    await fs.writeFile(lockPath, "held", "utf8");
    expect(existsSync(lockPath)).toBe(true);

    await fs.unlink(lockPath);

    await appendTelemetrySinkEvent({
      filePath,
      event: {
        type: "mirror.nudge",
        runId: "run-2",
        nudges: ["second"],
        ts: 2,
      },
      lockEnabled: true,
      lockPath,
      lockTimeoutMs: 200,
      lockPollMs: 10,
    });

    const content = await fs.readFile(filePath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "mirror.nudge",
      runId: "run-2",
      nudges: ["second"],
      ts: 2,
    });
  });
});
