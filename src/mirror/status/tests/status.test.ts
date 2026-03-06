import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../../memory/sqlite.js";
import { formatMirrorStatusHuman } from "../format.js";
import { getMirrorStatus } from "../status.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-status-"));
  tempDirs.push(dir);
  return dir;
}

describe("mirror status", () => {
  it("returns exists=false for missing storage files without throwing", async () => {
    const dir = await createTempDir();
    const status = await getMirrorStatus({
      cwd: dir,
      now: new Date("2026-03-05T00:00:00.000Z"),
      ndjsonPath: path.join(dir, "missing.ndjson"),
      dbPath: path.join(dir, "missing.sqlite"),
      env: {},
    });

    expect(status.ts).toBe("2026-03-05T00:00:00.000Z");
    expect(status.storage.ndjsonExists).toBe(false);
    expect(status.storage.sqliteExists).toBe(false);
    expect(status.storage.ndjsonBytes).toBeUndefined();
    expect(status.storage.sqliteEvents).toBeUndefined();
    expect(status.privacy.boundaryGuard).toBe(true);
    expect(JSON.stringify(status)).not.toContain("travelerName");
  });

  it("returns ndjson file size when present", async () => {
    const dir = await createTempDir();
    const ndjsonPath = path.join(dir, "telemetry.ndjson");
    await fs.writeFile(ndjsonPath, '{"type":"mirror.nudge"}\n', "utf8");

    const status = await getMirrorStatus({
      ndjsonPath,
      dbPath: path.join(dir, "missing.sqlite"),
      env: {},
    });

    expect(status.storage.ndjsonExists).toBe(true);
    expect(status.storage.ndjsonBytes).toBeGreaterThan(0);
  });

  it("returns sqlite event count when db and events table exist", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "telemetry.sqlite");
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL, run_id TEXT, payload_json TEXT NOT NULL)",
      );
      db.exec(
        "INSERT INTO events(ts, type, run_id, payload_json) VALUES (1, 'mirror.nudge', 'run-1', '{}'), (2, 'mirror.nudge', 'run-2', '{}')",
      );
    } finally {
      db.close();
    }

    const status = await getMirrorStatus({
      ndjsonPath: path.join(dir, "missing.ndjson"),
      dbPath,
      env: {},
    });

    expect(status.storage.sqliteExists).toBe(true);
    expect(status.storage.sqliteEvents).toBe(2);
  });

  it("produces valid json output payload for --json path", async () => {
    const dir = await createTempDir();
    const status = await getMirrorStatus({
      cwd: dir,
      ndjsonPath: path.join(dir, "missing.ndjson"),
      dbPath: path.join(dir, "missing.sqlite"),
      env: {
        MIRROR_TELEMETRY_ENABLED: "1",
        MIRROR_TELEMETRY_SINK_ENABLED: "1",
        MIRROR_PASSPORT_TELEMETRY_ENABLED: "1",
      },
    });

    const json = JSON.stringify(status);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty("telemetry");
    expect(parsed).toHaveProperty("storage");

    const human = formatMirrorStatusHuman(status);
    expect(human).toContain("🪞 Mirror Runtime");
  });
});
