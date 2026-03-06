import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../../memory/sqlite.js";
import { runMirrorDoctor } from "../doctor.js";
import { formatMirrorDoctorHuman } from "../format.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-doctor-"));
  tempDirs.push(dir);
  return dir;
}

async function createSqliteWithEvents(dbPath: string, count: number): Promise<void> {
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(
      "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL, run_id TEXT, payload_json TEXT NOT NULL)",
    );
    for (let i = 0; i < count; i += 1) {
      db.prepare("INSERT INTO events(ts, type, run_id, payload_json) VALUES (?, ?, ?, ?)").run(
        i + 1,
        "mirror.nudge",
        `run-${i + 1}`,
        "{}",
      );
    }
  } finally {
    db.close();
  }
}

describe("mirror doctor", () => {
  it("handles missing files without throwing", async () => {
    const dir = await createTempDir();
    const report = await runMirrorDoctor({
      now: new Date("2026-03-05T00:00:00.000Z"),
      ndjsonPath: path.join(dir, "missing.ndjson"),
      dbPath: path.join(dir, "missing.sqlite"),
      env: {},
    });

    expect(report.ts).toBe("2026-03-05T00:00:00.000Z");
    expect(report.checks.length).toBeGreaterThan(0);
    expect(
      report.checks.some((entry) => entry.key === "sink.file" && entry.status === "WARN"),
    ).toBe(true);
    expect(report.overall).toBe("DEGRADED");
  });

  it("reports sqlite event count when db exists", async () => {
    const dir = await createTempDir();
    const ndjsonPath = path.join(dir, "telemetry.ndjson");
    const dbPath = path.join(dir, "telemetry.sqlite");

    await fs.writeFile(ndjsonPath, '{"type":"mirror.nudge"}\n', "utf8");
    await createSqliteWithEvents(dbPath, 2);

    const report = await runMirrorDoctor({
      ndjsonPath,
      dbPath,
      env: {
        MIRROR_TELEMETRY_ENABLED: "1",
        MIRROR_TELEMETRY_SINK_ENABLED: "1",
        MIRROR_PASSPORT_TELEMETRY_ENABLED: "1",
        MIRROR_PRIVACY_BOUNDARY_ENABLED: "1",
        MIRROR_AGENT_ID: "agent-main",
        MIRROR_RUN_ID: "run-main",
      },
    });

    const sqliteEvents = report.checks.find((entry) => entry.key === "sqlite.events");
    expect(sqliteEvents?.status).toBe("PASS");
    expect(sqliteEvents?.message).toContain("2 events");
  });

  it("produces stable json shape", async () => {
    const dir = await createTempDir();
    const report = await runMirrorDoctor({
      ndjsonPath: path.join(dir, "missing.ndjson"),
      dbPath: path.join(dir, "missing.sqlite"),
      env: {},
    });

    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(typeof parsed.ts).toBe("string");
    expect(parsed).toHaveProperty("overall");
    expect(Array.isArray(parsed.checks)).toBe(true);

    const human = formatMirrorDoctorHuman(report);
    expect(human).toContain("🪞 Mirror Doctor");
  });

  it("returns GOOD, DEGRADED, BROKEN across health transitions", async () => {
    const goodDir = await createTempDir();
    const goodNdjson = path.join(goodDir, "telemetry.ndjson");
    const goodDb = path.join(goodDir, "telemetry.sqlite");
    await fs.writeFile(goodNdjson, '{"type":"mirror.nudge"}\n', "utf8");
    await createSqliteWithEvents(goodDb, 1);

    const good = await runMirrorDoctor({
      ndjsonPath: goodNdjson,
      dbPath: goodDb,
      env: {
        MIRROR_TELEMETRY_ENABLED: "1",
        MIRROR_TELEMETRY_SINK_ENABLED: "1",
        MIRROR_PASSPORT_TELEMETRY_ENABLED: "1",
        MIRROR_PRIVACY_BOUNDARY_ENABLED: "1",
        MIRROR_AGENT_ID: "agent-main",
        MIRROR_RUN_ID: "run-main",
      },
    });
    expect(good.overall).toBe("GOOD");

    const degradedDir = await createTempDir();
    const degraded = await runMirrorDoctor({
      ndjsonPath: path.join(degradedDir, "missing.ndjson"),
      dbPath: path.join(degradedDir, "missing.sqlite"),
      env: {},
    });
    expect(degraded.overall).toBe("DEGRADED");

    const brokenDir = await createTempDir();
    const brokenDb = path.join(brokenDir, "broken.sqlite");
    await fs.writeFile(brokenDb, "not-a-sqlite-db", "utf8");

    const broken = await runMirrorDoctor({
      ndjsonPath: path.join(brokenDir, "missing.ndjson"),
      dbPath: brokenDb,
      env: {
        MIRROR_TELEMETRY_ENABLED: "1",
        MIRROR_TELEMETRY_SINK_ENABLED: "1",
      },
    });
    expect(broken.overall).toBe("BROKEN");
    expect(
      broken.checks.some((entry) => entry.key === "sqlite.events" && entry.status === "FAIL"),
    ).toBe(true);
  });
});
