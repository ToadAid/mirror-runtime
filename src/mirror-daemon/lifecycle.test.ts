import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getMirrorDaemonStatus,
  readMirrorDaemonPidFile,
  stopMirrorDaemon,
  writeMirrorDaemonPidFile,
} from "./lifecycle.js";

describe("mirror-daemon lifecycle helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("reports not running when pid file is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-lifecycle-"));
    tempDirs.push(tempDir);
    const pidFilePath = path.join(tempDir, "daemon.pid");

    const status = await getMirrorDaemonStatus(pidFilePath);
    expect(status.running).toBe(false);
    expect(status.pid).toBeNull();
    expect(status.stale).toBe(false);
  });

  it("stop removes stale pid file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-lifecycle-"));
    tempDirs.push(tempDir);
    const pidFilePath = path.join(tempDir, "daemon.pid");

    await writeMirrorDaemonPidFile(pidFilePath, {
      pid: 999_999_999,
      host: "127.0.0.1",
      port: 8787,
      storeRoot: tempDir,
      startedAt: new Date().toISOString(),
    });

    const result = await stopMirrorDaemon(pidFilePath);
    expect(result.stopped).toBe(false);
    expect(result.stale).toBe(true);

    const after = await readMirrorDaemonPidFile(pidFilePath);
    expect(after).toBeNull();
  });
});
