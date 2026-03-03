-- Memory / Mistake Ledger v1 — Schema
-- Tables: memory_events, mistake_events, meta

-- memory_events table
CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  user_id TEXT NULL,
  session_id TEXT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NULL,
  confidence REAL NULL,
  tags_json TEXT NULL
);

-- mistake_events table
CREATE TABLE IF NOT EXISTS mistake_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  run_id TEXT NULL,
  tool_name TEXT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  expected TEXT NULL,
  actual TEXT NULL,
  severity TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  notes TEXT NULL
);

-- meta table
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_ts ON memory_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_events(user_id);
CREATE INDEX IF NOT EXISTS idx_mistake_resolved ON mistake_events(resolved);
CREATE INDEX IF NOT EXISTS idx_mistake_ts ON mistake_events(ts DESC);