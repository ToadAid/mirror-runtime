/**
 * Memory / Mistake Ledger v1 — Database Initialization
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { applySchema } from "./schema.js";

let dbInstance: Database.Database | null = null;
let dbPath: string | null = null;

/**
 * Initialize the ledger
 */
export function initLedger(config: { path?: string } = {}): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const basePath = config.path ?? process.env.MIRROR_LEDGER_PATH ?? path.resolve(process.env.HOME || process.cwd(), ".mirror/ledger.sqlite");
  const resolvedPath = path.resolve(basePath);

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(resolvedPath);

  // Apply schema
  applySchema(dbInstance);

  dbPath = resolvedPath;

  return dbInstance;
}

/**
 * Get the database instance (lazy init)
 */
export function getLedgerDb(): Database {
  if (!dbInstance) {
    return initLedger();
  }
  return dbInstance;
}

/**
 * Check if ledger is enabled
 */
export function isLedgerEnabled(): boolean {
  const v = process.env.MIRROR_LEDGER ?? "0";
  return v === "1" || v.toLowerCase() === "true";
}

/**
 * Get the database path
 */
export function getLedgerPath(): string | null {
  return dbPath;
}

/**
 * Close the ledger connection
 */
export function closeLedger(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPath = null;
  }
}

/**
 * Get ledger statistics
 */
export function getLedgerStats(): {
  memory_count: number;
  mistake_count: number;
  unresolved_mistakes: number;
} {
  const db = getLedgerDb();

  const memoryCount = (db.prepare("SELECT COUNT(*) as count FROM memory_events").get() as { count: number }).count;
  const mistakeCount = (db.prepare("SELECT COUNT(*) as count FROM mistake_events").get() as { count: number }).count;
  const unresolvedMistakes = (db.prepare("SELECT COUNT(*) as count FROM mistake_events WHERE resolved = 0").get() as { count: number }).count;

  return {
    memory_count: memoryCount,
    mistake_count: mistakeCount,
    unresolved_mistakes: unresolvedMistakes,
  };
}