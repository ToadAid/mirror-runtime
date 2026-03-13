import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureScrollIndexUpToDate } from "../scroll_index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-scroll-index-"));
  tempDirs.push(dir);
  return dir;
}

describe("ensureScrollIndexUpToDate", () => {
  it("creates scroll_index.json when it is missing", async () => {
    const loreDir = await createTempDir();
    await fs.writeFile(path.join(loreDir, "TOBY_L001_FirstScroll.md"), "body\n", "utf8");

    const result = await ensureScrollIndexUpToDate(loreDir);
    const indexPath = path.join(loreDir, "_index", "scroll_index.json");
    const raw = await fs.readFile(indexPath, "utf8");
    const data = JSON.parse(raw) as Array<{ scroll_id: string; path: string; keywords: string[] }>;

    expect(result.rebuilt).toBe(true);
    expect(result.reason).toBe("missing");
    expect(data).toEqual([
      {
        scroll_id: "TOBY_L001",
        title: "FirstScroll",
        path: "TOBY_L001_FirstScroll.md",
        keywords: ["first", "scroll"],
      },
    ]);
  });

  it("rebuilds scroll_index.json when a scroll is newer than the index", async () => {
    const loreDir = await createTempDir();
    const scrollPath = path.join(loreDir, "TOBY_L001_FirstScroll.md");
    const indexDir = path.join(loreDir, "_index");
    const indexPath = path.join(indexDir, "scroll_index.json");

    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(scrollPath, "older\n", "utf8");
    await fs.writeFile(indexPath, "[]\n", "utf8");

    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    const newDate = new Date("2026-01-02T00:00:00.000Z");
    await fs.utimes(indexPath, oldDate, oldDate);
    await fs.utimes(scrollPath, newDate, newDate);

    const result = await ensureScrollIndexUpToDate(loreDir);
    const data = JSON.parse(await fs.readFile(indexPath, "utf8")) as Array<{ scroll_id: string }>;

    expect(result.rebuilt).toBe(true);
    expect(result.reason).toBe("stale");
    expect(data).toHaveLength(1);
    expect(data[0]?.scroll_id).toBe("TOBY_L001");
  });

  it("does not rebuild when the index is fresh", async () => {
    const loreDir = await createTempDir();
    const scrollPath = path.join(loreDir, "TOBY_L001_FirstScroll.md");

    await fs.writeFile(scrollPath, "body\n", "utf8");
    await ensureScrollIndexUpToDate(loreDir);

    const indexPath = path.join(loreDir, "_index", "scroll_index.json");
    const before = await fs.stat(indexPath);
    const result = await ensureScrollIndexUpToDate(loreDir);
    const after = await fs.stat(indexPath);

    expect(result.rebuilt).toBe(false);
    expect(result.reason).toBe("fresh");
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
