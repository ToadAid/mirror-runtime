CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT NOT NULL CHECK (source_type IN ('tweet', 'telegram', 'manual', 'system')),
  source_ref TEXT,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL,
  is_canon_candidate INTEGER NOT NULL DEFAULT 0 CHECK (is_canon_candidate IN (0, 1))
);

CREATE TABLE IF NOT EXISTS canon_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  reference_scroll TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT NOT NULL UNIQUE,
  preferred_language TEXT,
  tone_preference TEXT,
  recurring_topics TEXT,
  journey_stage TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS retrieval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  question TEXT NOT NULL,
  answer_summary TEXT NOT NULL,
  referenced_scrolls TEXT NOT NULL,
  referenced_observation_ids TEXT NOT NULL,
  confidence REAL
);

CREATE INDEX IF NOT EXISTS idx_observations_topic_created
  ON observations(topic, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canon_updates_topic_created
  ON canon_updates(topic, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retrieval_history_user_created
  ON retrieval_history(user_id, created_at DESC);
