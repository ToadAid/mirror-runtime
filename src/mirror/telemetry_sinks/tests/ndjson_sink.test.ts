import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTelemetrySinkEvent } from "../ndjson_sink.js";

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
      rotateBytes: 1_000_000,
    });

    await appendTelemetrySinkEvent({
      filePath,
      event: {
        type: "mirror.nudge",
        runId: "run-2",
        nudges: ["second nudge"],
        ts: 2,
      },
      rotateBytes: 1_000_000,
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

  it("removes human-identifiable fields when privacy boundary is enabled", async () => {
    process.env.MIRROR_PRIVACY_BOUNDARY_ENABLED = "1";
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-sink-privacy-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sink.ndjson");

    await appendTelemetrySinkEvent({
      filePath,
      event: {
        type: "mirror.nudge",
        runId: "run-privacy",
        nudges: ["hello"],
        ts: 99,
        humanName: "Tommy",
      } as unknown as Parameters<typeof appendTelemetrySinkEvent>[0]["event"],
      rotateBytes: 1_000_000,
    });

    const content = await fs.readFile(filePath, "utf8");
    expect(content).not.toContain("Tommy");
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("humanName");
    expect(parsed).toMatchObject({
      type: "mirror.nudge",
      runId: "run-privacy",
      nudges: ["hello"],
      ts: 99,
    });
  });
});
