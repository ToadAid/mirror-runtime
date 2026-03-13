import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeMirrorMemoryDb, initMirrorMemoryDb } from "./db.js";

const createdPaths: string[] = [];

afterEach(() => {
  closeMirrorMemoryDb();

  for (const createdPath of createdPaths.splice(0)) {
    fs.rmSync(path.dirname(createdPath), { recursive: true, force: true });
  }
});

describe("mirror memory db initialization", () => {
  it("creates the sqlite file and required tables", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-memory-"));
    const dbPath = path.join(tempDir, "mirror-memory.sqlite");
    createdPaths.push(dbPath);

    const db = initMirrorMemoryDb({ path: dbPath });

    expect(fs.existsSync(dbPath)).toBe(true);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain("observations");
    expect(tableNames).toContain("canon_updates");
    expect(tableNames).toContain("user_reflections");
    expect(tableNames).toContain("retrieval_history");
  });
});
