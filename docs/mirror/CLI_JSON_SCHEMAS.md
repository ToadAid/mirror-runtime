# Mirror CLI JSON Schemas

Mirror CLI emits human-readable output by default. Pass `--json` to receive stable machine-readable output.
The canonical automation surface is `mirror ...`. `openclaw mirror ...` is compatibility-only.

Error shape:

```json
{
  "ok": false,
  "command": "interpret",
  "error": "Mirror operator auth is not configured"
}
```

## `mirror chat --json`

```json
{
  "ok": true,
  "command": "chat",
  "response": "Cancelled.",
  "model": "mirror-default",
  "usage": {
    "prompt_tokens": 1,
    "completion_tokens": 1,
    "total_tokens": 2
  }
}
```

## `mirror find --json`

```json
{
  "ok": true,
  "command": "find",
  "results": [],
  "diagnostics": {}
}
```

## `mirror fact --json`

```json
{
  "ok": true,
  "command": "fact",
  "canonical_fact": "The Patience Vault was cancelled at Rune3.",
  "source": {
    "scroll_id": "TOBY_L1219",
    "title": "Rune3 Patience Vault Cancelled",
    "path": "TOBY_L1219_Rune3_PatienceVaultCancelled.md"
  }
}
```

## `mirror interpret --json`

```json
{
  "ok": true,
  "command": "interpret",
  "interpretation": {}
}
```

## `mirror forge --json`

```json
{
  "ok": true,
  "command": "forge",
  "draft": {}
}
```

## `mirror commit --json`

```json
{
  "ok": true,
  "command": "commit",
  "commit_result": {}
}
```

## `mirror status --json`

```json
{
  "ok": true,
  "command": "status",
  "status": {
    "ts": "2026-03-13T00:00:00.000Z",
    "telemetry": {},
    "storage": {}
  }
}
```

## `mirror verify-lore --json`

```json
{
  "ok": true,
  "command": "verify-lore",
  "verification": {
    "manifest_path": "lore/manifest.json",
    "directory": "lore/canonical",
    "ok": true,
    "checked": 10,
    "matched": 10,
    "missing": [],
    "mismatched": []
  }
}
```

## `mirror serve --json`

```json
{
  "ok": true,
  "command": "serve",
  "service": {
    "port": 7777,
    "lore_dir": "/abs/path/lore-scrolls",
    "provider_url": "http://brain.local/v1/chat/completions",
    "node_id": "mirror-node-local",
    "base_url": "http://127.0.0.1:7777"
  }
}
```

## `mirror task ... --json`

```json
{
  "ok": true,
  "command": "task",
  "action": "create",
  "task": {
    "id": "task-id",
    "title": "Prepare check-in"
  }
}
```

List/delete variants return:

```json
{
  "ok": true,
  "command": "task",
  "action": "list",
  "tasks": []
}
```

```json
{
  "ok": true,
  "command": "task",
  "action": "delete",
  "deleted": true,
  "task_id": "task-id"
}
```

## `mirror reminder ... --json`

```json
{
  "ok": true,
  "command": "reminder",
  "action": "create",
  "reminder": {
    "id": "reminder-id",
    "title": "Water the pond"
  }
}
```

Due/list variants return:

```json
{
  "ok": true,
  "command": "reminder",
  "action": "due",
  "reminders": []
}
```

## `mirror heartbeat ... --json`

```json
{
  "ok": true,
  "command": "heartbeat",
  "action": "update",
  "heartbeat": {
    "enabled": true,
    "preferred_tone": "calm"
  }
}
```

## `mirror monk ... --json`

Context returns:

```json
{
  "ok": true,
  "command": "monk",
  "action": "context",
  "context": {
    "user": {
      "user_id": "local-user"
    }
  }
}
```

Compatibility-only admin paths such as `openclaw mirror doctor`, `passport`, and telemetry replay/index/query/reflect are not part of the canonical standalone Mirror JSON automation surface.

Action-oriented variants return:

```json
{
  "ok": true,
  "command": "monk",
  "action": "next",
  "action_result": {
    "kind": "next_task",
    "summary": "Next active task: Review notes."
  }
}
```

Reminder summary variants return:

```json
{
  "ok": true,
  "command": "monk",
  "action": "reminders",
  "actions": []
}
```

Note/recording variants return:

```json
{
  "ok": true,
  "command": "monk",
  "action": "note",
  "note": {
    "content": "Monk follow-up: Review the next open task."
  }
}
```

Evaluation returns:

```json
{
  "ok": true,
  "command": "heartbeat",
  "action": "evaluate",
  "evaluation": {
    "due": false,
    "reason": "recent_activity"
  },
  "suggested_message": "The pond has been quiet. Just checking in — are you alright?",
  "suggested_tone": "gentle"
}
```
