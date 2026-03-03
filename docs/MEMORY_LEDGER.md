# Memory / Mistake Ledger v1 (SQLite)

A local-first, SQLite-backed ledger for tracking user memories and system mistakes. Designed to be safe, deterministic, and LAN-friendly.

## Overview

The ledger tracks two types of events:

1. **Memory events** — Facts we decide to store about the user (e.g., "user prefers dark mode")
2. **Mistake events** — When the system was wrong, or conflicts appeared (e.g., "tool API timeout")

The ledger is:
- **Append-only** — Events can only be added, never deleted or modified
- **Feature-flagged** — Disabled by default (`MIRROR_LEDGER=0`)
- **Privacy-first** — Never stores secrets, tokens, or private keys
- **Deterministic** — Same inputs always produce the same database state

## Tables

### memory_events

Stores user memories and forgetting decisions.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique UUID |
| ts | INTEGER | Timestamp (ms since epoch) |
| user_id | TEXT (optional) | User identifier |
| session_id | TEXT (optional) | Session identifier |
| kind | TEXT | `memory` or `forget` |
| key | TEXT | Human-readable key |
| value_json | TEXT | JSON string of value |
| source | TEXT | `agent0`, `runtime`, `user`, or `tool` |
| confidence | INTEGER | 0-100 confidence score |
| tags_json | TEXT | JSON array of tags |
| UNIQUE(ts, key) | | Prevents duplicates by timestamp + key |

### mistake_events

Stores system mistakes and errors.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique UUID |
| ts | INTEGER | Timestamp (ms since epoch) |
| run_id | TEXT (optional) | Run identifier |
| tool_name | TEXT (optional) | Tool name |
| category | TEXT | One of: `tool_error`, `logic_error`, `context_mismatch`, `data_quality`, `config_error`, `unexpected_behavior` |
| summary | TEXT | Short summary |
| expected | TEXT (optional) | Expected behavior |
| actual | TEXT (optional) | Actual behavior |
| severity | TEXT | One of: `low`, `medium`, `high`, `critical` |
| resolved | INTEGER | `0` (unresolved) or `1` (resolved) |
| notes | TEXT (optional) | Additional notes |
| UNIQUE(ts, summary) | | Prevents duplicates by timestamp + summary |

### meta

Stores configuration and metadata.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT (PK) | Configuration key |
| value | TEXT | Configuration value |

## Enabling the Ledger

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MIRROR_LEDGER` | `0` | Enable ledger (`1` to enable) |
| `MIRROR_LEDGER_PATH` | `~/.mirror/ledger.sqlite` | SQLite database path |
| `MIRROR_LEDGER_LOG_ONLY` | `0` | Record events only (no behavioral impact) |

### Example

```bash
# Enable ledger
export MIRROR_LEDGER=1

# Custom database path
export MIRROR_LEDGER_PATH=/tmp/ledger.sqlite

# Log-only mode (records but doesn't change behavior)
export MIRROR_LEDGER=1
export MIRROR_LEDGER_LOG_ONLY=1
```

## Using the API

### Initialize

```typescript
import { initLedger, isLedgerEnabled } from "@mirror/memory_ledger";

if (isLedgerEnabled()) {
  const db = initLedger();
  // Use ledger...
}
```

### Add a Memory Event

```typescript
import { addMemoryEvent } from "@mirror/memory_ledger";

const result = addMemoryEvent(db, {
  kind: "memory",
  key: "user_name",
  value_json: { name: "Alice" },
  source: "user",
  confidence: 95,
  tags: ["user", "name"],
});

console.log(result.event_id); // UUID
console.log(result.is_duplicate); // true if duplicate
```

### Add a Mistake Event

```typescript
import { addMistakeEvent } from "@mirror/memory_ledger";

const result = addMistakeEvent(db, {
  category: "tool_error",
  summary: "API timeout",
  expected: "Success",
  actual: "Timeout after 5000ms",
  severity: "high",
  tool_name: "fetch_tool",
});

console.log(result.event_id); // UUID
console.log(result.is_duplicate); // true if duplicate
```

### List Memory Events

```typescript
import { listMemoryEvents } from "@mirror/memory_ledger";

// List all memory events
const all = listMemoryEvents(db, {});

// Filter by kind
const memories = listMemoryEvents(db, { kind: "memory" });

// Filter by user
const forUser = listMemoryEvents(db, { user_id: "user123" });

// Limit results
const recent = listMemoryEvents(db, { limit: 10 });

// Filter by tag (parse tags_json first)
const tagged = listMemoryEvents(db, {});
tagged.forEach(event => {
  const tags = JSON.parse(event.tags_json);
  if (tags.includes("prefers_dark_mode")) {
    // Use memory
  }
});
```

### List Mistake Events

```typescript
import { listMistakeEvents } from "@mirror/memory_ledger";

// List all mistakes
const all = listMistakeEvents(db, {});

// Filter by category
const toolErrors = listMistakeEvents(db, { category: "tool_error" });

// Filter by severity
const critical = listMistakeEvents(db, { severity: "critical" });

// List unresolved only
const unresolved = listMistakeEvents(db, { resolved: 0 });

// Filter by tool
const fromTool = listMistakeEvents(db, { tool_name: "fetch_tool" });
```

### Resolve a Mistake

```typescript
import { resolveMistake } from "@mirror/memory_ledger";

resolveMistake(db, mistakeId);
```

### Get Ledger Statistics

```typescript
import { getLedgerStats } from "@mirror/memory_ledger";

const stats = getLedgerStats(db);
console.log(stats);
// {
//   total_memory_events: 100,
//   total_mistake_events: 5,
//   unresolved_mistakes: 2,
//   by_category: { tool_error: 3, logic_error: 2 },
//   by_severity: { low: 1, medium: 1, high: 2, critical: 1 }
// }
```

## Querying with SQLite CLI

If you need to inspect the database directly:

```bash
# Open database
sqlite3 ~/.mirror/ledger.sqlite

# List all tables
.tables

# Query memory events
SELECT * FROM memory_events ORDER BY ts DESC LIMIT 10;

# Query mistakes by severity
SELECT * FROM mistake_events WHERE severity = 'high';

# Count unresolved mistakes
SELECT COUNT(*) FROM mistake_events WHERE resolved = 0;

# Export as CSV
.mode csv
.output memories.csv
SELECT * FROM memory_events;
.quit
```

## Privacy & Retention

### What We Don't Store

- No raw tool payloads (unless explicitly allowed)
- No secrets, tokens, or private keys
- No PII beyond what's already present in chat/runtime context
- No wallet addresses unless explicitly provided

### PII Guidelines

1. Store wallet addresses only if already present in chat/runtime context
2. Use `user_id` for privacy, not raw email/phone
3. Redact sensitive fields by default

### Retention Policy

- No automatic deletion (append-only ledger)
- User can manage database files manually
- Consider archiving old data to disk or cloud if needed

### Log-Only Mode

When `MIRROR_LEDGER_LOG_ONLY=1`:
- Events are still recorded to database
- Ledger does NOT influence system behavior (no memory lookups, no mistake corrections)
- Useful for auditing without side effects

## Determinism

The ledger is deterministic because:

1. **Same inputs → same database state**
   - Events are appended in order
   - No random seeding
   - No network dependencies

2. **No side effects**
   - No external API calls
   - No file system writes (besides SQLite file)
   - No state changes outside the database

3. **Reproducible migrations**
   - Schema is idempotent
   - Same migration runs always produce the same state

## Migration Strategy

### Current Version

- **Version**: 1
- **Schema**: Defined in `schema.ts`
- **Tables**: `memory_events`, `mistake_events`, `meta`

### Future Migrations

To add new tables/columns:

1. Create a new migration function in `schema.ts`
2. Use `INSERT OR REPLACE` for existing data
3. Update type definitions in `types.ts`
4. Test migration independently

Example:

```typescript
export function migrateToV2(db: Database): void {
  // Add new column
  db.exec("ALTER TABLE memory_events ADD COLUMN favorite_color TEXT");

  // Migrate existing data
  db.prepare("UPDATE memory_events SET favorite_color = 'unknown' WHERE favorite_color IS NULL").run();
}
```

## Testing

```bash
# Run all tests
pnpm -w test

# Run only ledger tests
pnpm -w test src/mirror/memory_ledger
```

## Acceptance Criteria

- [x] `pnpm -w build` ✅
- [x] `pnpm -w test` ✅
- [x] No behavior change when `MIRROR_LEDGER=0` ✅
- [x] Clear docs + safe schema ✅
- [x] One PR only (ledger module) ✅
- [x] Feature-flagged (default OFF) ✅
- [x] Append-only design ✅
- [x] Privacy-first (no secrets) ✅

## License

MIT