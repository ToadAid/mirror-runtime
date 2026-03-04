/**
 * Memory / Mistake Ledger v1 — DB backend abstraction
 */

import { createRequire } from "node:module";
import path from "node:path";
import { getSchemaVersion, initSchema } from "./schema.js";
import type { LedgerEventRow, LedgerQuery } from "./types.js";

const DEFAULT_PATH = path.resolve(process.env.HOME || process.cwd(), ".mirror/ledger.sqlite");
const requireModule = createRequire(import.meta.url);

type BetterSqliteDb = {
  config: { filename: string };
  pragma: (sql: string, opts?: { simple?: boolean }) => unknown;
  exec: (sql: string) => void;
  close: () => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => void;
    all: (...params: unknown[]) => unknown[];
  };
};

type BetterSqliteCtor = new (
  filename: string,
  options: { readonly: boolean; fileMustExist: boolean; busyTimeout: number },
) => BetterSqliteDb;

export interface LedgerDbOptions {
  path?: string;
}

export interface LedgerBackend {
  insert(event: LedgerEventRow): void;
  query(query: LedgerQuery): LedgerEventRow[];
  health(): { path: string; version: number; ok: boolean; error?: string };
  close(): void;
}

function resolveDbPath(options: LedgerDbOptions): string {
  return options.path ?? process.env.MIRROR_LEDGER_PATH ?? DEFAULT_PATH;
}

function loadBetterSqliteCtor(): BetterSqliteCtor {
  const loaded = requireModule("better-sqlite3");
  if (typeof loaded === "function") {
    return loaded as BetterSqliteCtor;
  }
  if (loaded && typeof loaded === "object" && "default" in loaded) {
    return loaded.default as BetterSqliteCtor;
  }
  throw new Error("better-sqlite3 did not export a constructor");
}

export function isBetterSqlite3Available(): boolean {
  try {
    const BetterSqlite = loadBetterSqliteCtor();
    const probe = new BetterSqlite(":memory:", {
      readonly: false,
      fileMustExist: false,
      busyTimeout: 1000,
    });
    probe.close();
    return true;
  } catch {
    return false;
  }
}

export function createSqliteBackend(options: LedgerDbOptions = {}): LedgerBackend {
  const dbPath = resolveDbPath(options);
  const BetterSqlite = loadBetterSqliteCtor();
  const db = new BetterSqlite(dbPath, {
    readonly: false,
    fileMustExist: false,
    busyTimeout: 5000,
  });

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  initSchema(db);

  return {
    insert(event) {
      db.prepare(
        `INSERT INTO ledger_events (
          id, ts, kind, run_id, tool_name, agent_id, user_id, session_id,
          severity, title, detail_json, tags_json, source, related_id, hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.id,
        event.ts,
        event.kind,
        event.run_id,
        event.tool_name,
        event.agent_id,
        event.user_id,
        event.session_id,
        event.severity,
        event.title,
        event.detail_json,
        event.tags_json,
        event.source,
        event.related_id,
        event.hash,
      );
    },
    query(query) {
      const clauses: string[] = [];
      const params: Array<string | number> = [];

      if (query.kind) {
        clauses.push("kind = ?");
        params.push(query.kind);
      }
      if (query.runId) {
        clauses.push("run_id = ?");
        params.push(query.runId);
      }
      if (query.toolName) {
        clauses.push("tool_name = ?");
        params.push(query.toolName);
      }
      if (query.source) {
        clauses.push("source = ?");
        params.push(query.source);
      }
      if (query.sinceTs !== undefined) {
        clauses.push("ts >= ?");
        params.push(query.sinceTs);
      }
      if (query.untilTs !== undefined) {
        clauses.push("ts <= ?");
        params.push(query.untilTs);
      }

      const limit = query.limit ?? 50;
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const sql = `SELECT * FROM ledger_events ${where} ORDER BY ts DESC LIMIT ?`;
      return db.prepare(sql).all(...params, limit) as LedgerEventRow[];
    },
    health() {
      try {
        return {
          path: db.config.filename,
          version: getSchemaVersion(db),
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
    },
    close() {
      db.close();
    },
  };
}
