import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function requireMirrorNodeSqlite(): typeof import("node:sqlite") {
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Mirror SQLite support is unavailable in this Node runtime (missing node:sqlite). ${message}`,
      { cause: err },
    );
  }
}
