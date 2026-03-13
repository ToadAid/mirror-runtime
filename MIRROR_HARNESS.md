# Mirror Harness

Mirror is the canonical product identity for the standalone runtime surface.
Any `openclaw mirror ...` commands or references are compatibility-only wrappers.

## Core operating principles

- Canon-first: canonical scrolls are the primary source of truth.
- Memory-after-canon: memory, observations, and history may support answers but never override canon.
- Symbols must follow `docs/lore/SYMBOL_REGISTRY.md`.
- Write-capable actions require operator auth.
- Review before commit.
- No automatic canon rewriting.

## Canon workflow

- `interpret -> forge -> review -> commit`
- Index refresh occurs after commit or canon sync write acceptance.
- Validation must pass before a scroll becomes a valid canon artifact.
- `force` override is operator-only and is not automatic.

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
- canon / graph / review / commit layer

Personal utility path:

- Mirror Gateway / Tool Registry
- workspace-backed utility modules
- task / reminder / heartbeat state

## Skill usage guide

### `mirror.find-scroll`

- Purpose: find canonical scroll candidates for a query.
- Input: `{ query: string, user_id?: string, limit?: integer }`
- Output: `{ query, candidates[], diagnostics? }`
- Auth: open

### `mirror.canon-fact`

- Purpose: resolve a canon-first factual answer.
- Input: `{ query: string, user_id?: string }`
- Output: `{ canonical_fact, source_scroll_id, title, path, diagnostics? }`
- Auth: open

### `mirror.interpret-tweet`

- Purpose: turn a raw source text into a forge-ready interpretation package.
- Input: `{ tweet_text: string, date?: string, source_ref?: string, preferred_family?: "L"|"QA"|"C" }`
- Output: interpretation payload including title, family, symbols, anchors, and forge payload.
- Auth: operator

### `mirror.forge-scroll`

- Purpose: generate a canonical draft scaffold.
- Input: `{ title: string, category: "L"|"QA"|"C", narrative: string, symbols?: string[], anchors?: object }`
- Output: `{ filename, frontmatter, scroll_template, suggested_symbols, validation }`
- Auth: operator

### `mirror.commit-scroll`

- Purpose: validate, review, and commit a scroll draft.
- Input: `{ draft_scroll_content: string, preferred_filename?: string, family_override?: "L"|"QA"|"C", dry_run?: boolean, force?: boolean }`
- Output: commit result including validation, review, final filename/path, and index refresh status.
- Auth: operator

### `mirror.task.*`

- Purpose: manage personal workspace tasks without touching canon.
- Tools:
  - `mirror.task.create`
  - `mirror.task.list`
  - `mirror.task.update`
  - `mirror.task.complete`
  - `mirror.task.delete`
- Input: user-scoped task payloads such as `{ user_id, title, description?, due_at?, tags?, related_draft_id? }`
- Output: `{ task }`, `{ tasks }`, or `{ deleted, task_id }`
- Auth: open

### `mirror.reminder.*`

- Purpose: manage personal workspace reminders and due checks without outbound delivery.
- Tools:
  - `mirror.reminder.create`
  - `mirror.reminder.list`
  - `mirror.reminder.update`
  - `mirror.reminder.delete`
  - `mirror.reminder.enable`
  - `mirror.reminder.disable`
  - `mirror.reminder.due`
- Input: user-scoped reminder payloads such as `{ user_id, title, remind_at?, recurrence?, related_task_id?, tags? }`
- Output: `{ reminder }`, `{ reminders }`, or `{ deleted, reminder_id }`
- Auth: open

### `mirror.heartbeat.*`

- Purpose: inspect and update opt-in heartbeat state and produce evaluation-only suggestions.
- Tools:
  - `mirror.heartbeat.get`
  - `mirror.heartbeat.update`
  - `mirror.heartbeat.record-seen`
  - `mirror.heartbeat.evaluate`
- Input: `{ user_id }` plus optional heartbeat preference or evaluation fields
- Output: `{ heartbeat }` or `{ evaluation, suggested_message, suggested_tone }`
- Auth: open

### `mirror.monk.*`

- Purpose: expose Monk workspace context and explicit follow-up assistance without autonomous execution.
- Tools:
  - `mirror.monk.context`
  - `mirror.monk.next-task`
  - `mirror.monk.open-work`
  - `mirror.monk.due-reminders`
  - `mirror.monk.resume`
  - `mirror.monk.followup-task`
  - `mirror.monk.followup-reminder`
  - `mirror.monk.note`
  - `mirror.monk.record-action`
- Input: user-scoped Monk assistance payloads such as `{ user_id }`, `{ user_id, task_id }`, `{ user_id, reminder_id }`, or Monk-owned note/action metadata
- Output: `{ context }`, `{ action }`, `{ actions }`, `{ resume_context }`, or `{ note }`
- Auth: open

## Operator auth rules

- Source of truth: `MIRROR_OPERATOR_TOKEN`
- Accepted auth transport:
  - `Authorization: Bearer <token>`
  - `x-mirror-operator-token: <token>`
- Open tools:
  - `mirror.find-scroll`
  - `mirror.canon-fact`
  - `mirror.task.*`
  - `mirror.reminder.*`
  - `mirror.heartbeat.*`
  - `mirror.monk.*`
- Operator-gated tools:
  - `mirror.interpret-tweet`
  - `mirror.forge-scroll`
  - `mirror.commit-scroll`

## JSON automation guidance

- Operators and agents should prefer `--json` for reliable automation.
- `--json` returns stable command-shaped JSON rather than internal implementation objects.
- In JSON mode, failures return a structured error object:
  - `{ "ok": false, "command": "<name>|null", "error": "..." }`
- Utility commands exposed through the CLI:
  - `mirror status`
  - `mirror verify-lore`
  - `mirror sync <peers|updates|announce|pull>`
  - `mirror task <create|list|update|complete|delete>`
  - `mirror reminder <create|list|update|delete|enable|disable|due>`
  - `mirror heartbeat <get|update|record-seen|evaluate>`
  - `mirror monk <context|next|open-work|reminders|resume|followup-task|followup-reminder|note|record-action>`
- Compatibility-only admin paths:
  - `openclaw mirror doctor`
  - `openclaw mirror passport`
  - `openclaw mirror telemetry ...`
