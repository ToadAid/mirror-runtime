/**
 * Memory / Mistake Ledger v1 — SQLite Database Layer
 */

import Database from "better-sqlite3";
import path from "node:path";
import { initSchema, getSchemaVersion } from "./schema.js";

const DEFAULT_PATH = path.resolve(process.env.HOME || process.cwd(), ".mirror/ledger.sqlite");

export interface LedgerDbOptions {
  path?: string;
}

export function openLedgerDb(
  options: LedgerDbOptions = {},
): Database.Database {
  const dbPath = options.path ?? process.env.MIRROR_LEDGER_PATH ?? DEFAULT_PATH;
  const db = new Database(dbPath, {
    readonly: false,
    fileMustExist: false,
    busyTimeout: 5000,
  });

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Initialize schema
  initSchema(db);

  return db;
}

export function closeLedgerDb(db: Database.Database): void {
  db.close();
}

export function withTx<T>(
  db: Database.Database,
  fn: (txn: Database.Database) => T,
): T {
  const txn = db.transaction(fn);
  return txn();
}

export function healthCheck(db: Database.Database): {
  path: string;
  version: number;
  ok: boolean;
  error?: string;
} {
  try {
    const version = getSchemaVersion(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    return {
      path: db.config.filename,
      version,
      ok: true,
    };
  } catch (error) {
    return {
      path: db.config.filename,
      version: getSchemaVersion(db),
      ok: false,
      error: String(error),
    };
  }
}