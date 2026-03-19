import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMirrorMemoryDbPath as resolveDefaultMirrorMemoryDbPath } from "../mirror-local/paths.js";
import { requireMirrorNodeSqlite } from "../mirror/shared/sqlite.js";
import type { MirrorMemoryDb } from "./types.js";

let dbInstance: MirrorMemoryDb | null = null;
let dbPath: string | null = null;

export function resolveMirrorMemoryDbPath(explicitPath?: string): string {
  return resolveDefaultMirrorMemoryDbPath(explicitPath);
}

function readSchema(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(currentDir, "schema.sql");
  return fs.readFileSync(schemaPath, "utf8");
}

export function initMirrorMemoryDb(config: { path?: string } = {}): MirrorMemoryDb {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = resolveMirrorMemoryDbPath(config.path);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const { DatabaseSync } = requireMirrorNodeSqlite();
  const db = new DatabaseSync(resolvedPath);
  db.exec(readSchema());

  dbInstance = db;
  dbPath = resolvedPath;
  return db;
}

export function getMirrorMemoryDb(): MirrorMemoryDb {
  return dbInstance ?? initMirrorMemoryDb();
}

export function getMirrorMemoryDbPath(): string | null {
  return dbPath;
}

export function closeMirrorMemoryDb(): void {
  if (!dbInstance) {
    return;
  }

  dbInstance.close();
  dbInstance = null;
  dbPath = null;
}
