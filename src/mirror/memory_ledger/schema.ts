/**
 * Memory / Mistake Ledger v1 — Schema Application
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Apply the schema to the database
 */
export function applySchema(db: Database): void {
  const schemaPath = path.join(__dirname, "schema.sql");

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  } else {
    throw new Error("Schema file not found");
  }

  // Set schema version
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')").run();
}