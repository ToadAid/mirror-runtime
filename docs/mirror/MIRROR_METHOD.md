# Mirror Method

Mirror is the canonical identity for the standalone runtime, CLI, service, and console surfaces.
`openclaw mirror ...` exists only as a compatibility wrapper for legacy operational flows.

## Core operating principles

- Canon-first: answer and author from canonical scrolls first.
- Memory-after-canon: observations, user reflection, and retrieval history are secondary context only.
- Symbols must follow `/lore/SYMBOL_REGISTRY`.
- Write-capable actions require operator auth.
- Review before commit.
- No automatic canon rewriting.

## Canon workflow

The canonical authoring path is:

- `interpret -> forge -> review -> commit`

Rules:

- index refresh happens after commit
- validation must pass before publish
- `force` override is operator-only
- synced canon artifacts must still validate before being written locally

## Runtime workflow

Chat path:

- Mirror CLI / Service / Gateway
- Mirror Chat Engine
- Reflection Engine
- Retrieval + Memory
- Provider Runtime

Tool path:

- Mirror Gateway / Tool Registry
- Mirror-native skill
- canon / graph / review / commit

Personal utility path:

- Mirror CLI / Console / Gateway
- Mirror-native utility tools
- user workspace state for tasks, reminders, and heartbeat

## Skill usage guide

### `mirror.find-scroll`

- Purpose: search canon for matching scrolls.
- Input shape: `{ query: string, user_id?: string, limit?: integer }`
- Output shape: `{ query, candidates, diagnostics? }`
- Auth: open

### `mirror.canon-fact`

- Purpose: resolve a canon-first fact statement.
- Input shape: `{ query: string, user_id?: string }`
- Output shape: `{ canonical_fact, source_scroll_id, title, path, diagnostics? }`
- Auth: open

### `mirror.interpret-tweet`

- Purpose: convert raw source text into a forge-ready interpretation package.
- Input shape: `{ tweet_text: string, date?: string, source_ref?: string, preferred_family?: "L"|"QA"|"C" }`
- Output shape: interpretation object including suggested title, family, symbols, anchors, and forge payload
- Auth: operator

### `mirror.forge-scroll`

- Purpose: generate a canonical draft scaffold.
- Input shape: `{ title: string, category: "L"|"QA"|"C", narrative: string, symbols?: string[], anchors?: object }`
- Output shape: `{ filename, frontmatter, scroll_template, suggested_symbols, validation }`
- Auth: operator

### `mirror.commit-scroll`

- Purpose: validate, review, and commit a draft.
- Input shape: `{ draft_scroll_content: string, preferred_filename?: string, family_override?: "L"|"QA"|"C", dry_run?: boolean, force?: boolean }`
- Output shape: commit result with validation, review, final file metadata, and index refresh status
- Auth: operator

### `mirror.task.*`

- Purpose: manage personal workspace tasks
- Input shape: `{ user_id, ...task_fields }`
- Output shape: `{ task }`, `{ tasks }`, or `{ deleted, task_id }`
- Auth: open

### `mirror.reminder.*`

- Purpose: manage personal reminders and due checks
- Input shape: `{ user_id, ...reminder_fields }`
- Output shape: `{ reminder }`, `{ reminders }`, or `{ deleted, reminder_id }`
- Auth: open

### `mirror.heartbeat.*`

- Purpose: inspect or update opt-in heartbeat state and generate suggestion-only evaluations
- Input shape: `{ user_id, ...heartbeat_fields }`
- Output shape: `{ heartbeat }` or `{ evaluation, suggested_message, suggested_tone }`
- Auth: open

### `mirror.monk.*`

- Purpose: expose read-first Monk assistance on top of workspace state
- Input shape: `{ user_id, ...optional_followup_fields }`
- Output shape: `{ context }`, `{ action }`, `{ actions }`, `{ resume_context }`, or `{ note }`
- Auth: open

## Operator auth rules

- Environment token: `MIRROR_OPERATOR_TOKEN`
- Accepted transport:
  - `Authorization: Bearer <token>`
  - `x-mirror-operator-token: <token>`
- Open commands/tools:
  - `find`
  - `fact`
  - `task`
  - `reminder`
  - `heartbeat`
  - `monk`
- Gated commands/tools:
  - `interpret`
  - `forge`
  - `commit`

## JSON automation guidance

- Prefer `--json` for automation and agent integration.
- Stable JSON schemas are documented in `/mirror/cli-json-schemas`.
- Human-readable output remains the default.
- Canonical standalone operator commands include `mirror status`, `mirror verify-lore`, and `mirror sync ...`.
- Compatibility-only admin flows remain under `openclaw mirror doctor|passport|telemetry ...`.
