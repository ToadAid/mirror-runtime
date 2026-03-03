# Memory / Mistake Ledger v1

## Purpose

A lightweight SQLite ledger for recording memory events, mistakes, and decisions. Useful for debugging, auditing, and understanding what the agent chooses to remember or forget.

## Flags

- `MIRROR_LEDGER=1` — Enable ledger (default: `0`)
- `MIRROR_LEDGER_PATH=...` — SQLite file path (default: `~/.mirror/ledger.sqlite`)
- `MIRROR_LEDGER_REDACT=1` — Redact sensitive fields (default: `1`)

## Schema

Table: `ledger_events`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | UUID primary key |
| ts | INTEGER | Unix timestamp (ms) |
| kind | TEXT | `"memory"` \| `"mistake"` \| `"decision"` |
| run_id | TEXT | Run context (if available) |
| tool_name | TEXT | Tool name (if applicable) |
| agent_id | TEXT | Agent ID (if available) |
| user_id | TEXT | User ID (if available) |
| session_id | TEXT | Session ID (if available) |
| severity | TEXT | `"info"` \| `"warn"` \| `"error"` |
| title | TEXT | Event title |
| detail_json | TEXT | JSON string of event details |
| tags_json | TEXT | JSON string of tags array |
| source | TEXT | `"user"` \| `"agent"` \| `"system"` |
| related_id | TEXT | Linked event ID |
| hash | TEXT | SHA256 hash of `detail_json` (normalized) |

Indexes:
- `idx_ledger_ts` on `ts`
- `idx_ledger_kind_ts` on `(kind, ts)`
- `idx_ledger_runid_ts` on `(run_id, ts)`

## Inspection

```bash
# List recent events
sqlite3 .mirror/ledger.sqlite "SELECT ts, kind, title, severity FROM ledger_events ORDER BY ts DESC LIMIT 20;"

# Count by kind
sqlite3 .mirror/ledger.sqlite "SELECT kind, COUNT(*) FROM ledger_events GROUP BY kind;"

# Search for mistakes
sqlite3 .mirror/ledger.sqlite "SELECT * FROM ledger_events WHERE kind='mistake' AND severity='error' ORDER BY ts DESC LIMIT 10;"
```

## Usage

```typescript
import { getLedger } from "@openclaw/mirror/mistake_ledger";

const ledger = getLedger({
  enabled: true,
  path: process.env.MIRROR_LEDGER_PATH,
  redact: true,
});

// Record a memory event
ledger.record({
  kind: "memory",
  title: "user_preferences_loaded",
  detail: { preferences: { theme: "dark" } },
});

// Record a mistake
ledger.record({
  kind: "mistake",
  title: "tool_result_validation_failed",
  severity: "error",
  toolName: "web_fetch",
  detail: { error: "404", url: "https://example.com" },
});

// Query events
const events = ledger.query({
  kind: "mistake",
  limit: 50,
});

// Health check
const health = ledger.health();
console.log(health);
```

## Acceptance Checklist

- ✅ `pnpm -w build` passes
- ✅ `pnpm -w test` passes
- ✅ Ledger disabled by default (`MIRROR_LEDGER=0`)
- ✅ No runtime behavior changes when disabled
- ✅ Records at least one "mistake" path + one "decision" path when enabled
- ✅ Docs present