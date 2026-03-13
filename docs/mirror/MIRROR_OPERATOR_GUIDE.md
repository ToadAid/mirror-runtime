# Mirror Operator Guide

## Mirror Runtime Overview

Mirror Runtime is a standalone Mirror-operated runtime surface.

Primary operator paths:

- `mirror ...` for the standalone Mirror CLI
- `/mirror/*` for the standalone Mirror service routes

Compatibility-only path:

- `openclaw mirror ...` for legacy diagnostics and telemetry workflows

Mirror provides operators with read-only inspection tools for:

- Runtime diagnostics and health checks
- Telemetry capture and event inspection
- Telemetry replay and analysis workflows
- Runtime identity reporting through passport

These tools are intended to inspect Mirror runtime behavior without modifying runtime state.

## Mirror CLI Commands

### doctor

Canonical standalone entrypoint:

```bash
mirror help
```

Purpose:

- Show the standalone Mirror command surface
- Point operators to the canonical Mirror runtime entrypoints

Compatibility command:

```bash
openclaw mirror doctor
```

Purpose:

- Run compatibility diagnostics for legacy telemetry/operator flows

Options:

- `--json`
- `--ndjson-path <path>`
- `--db <path>`

### status

Primary standalone command:

```bash
mirror status
```

Purpose:

- Provide a quick standalone runtime summary
- Show telemetry and storage configuration state
- Confirm the canonical Mirror operator surface is reachable

Options:

- `--json`
- `--ndjson-path <path>`
- `--db <path>`

Compatibility wrapper:

```bash
openclaw mirror status
```

### passport

Compatibility command:

```bash
openclaw mirror passport
```

Purpose:

- Print the runtime identity document
- Help debug agent identity and run identity

Options:

- `--json`

### telemetry tail

Compatibility command:

```bash
openclaw mirror telemetry tail
```

Purpose:

- Show a live stream of Mirror telemetry events

Options:

- `--limit <n>`
- `--json`
- `--path <path>`

### telemetry replay

Compatibility-only command:

```bash
openclaw mirror telemetry replay
```

Purpose:

- Replay telemetry history from sink files

### telemetry index

Compatibility-only command:

```bash
openclaw mirror telemetry index
```

Purpose:

- Build a SQLite telemetry index from telemetry sink data

### telemetry query

Compatibility-only command:

```bash
openclaw mirror telemetry query
```

Purpose:

- Query events from the telemetry SQLite index

### telemetry reflect

Compatibility-only command:

```bash
openclaw mirror telemetry reflect
```

Purpose:

- Produce summarized runtime reflection from telemetry data

### verify-lore

Primary standalone command:

```bash
mirror verify-lore
```

Purpose:

- Verify canonical lore files against a lore manifest
- Support canon validation on the standalone Mirror surface

Options:

- `--manifest <path>`
- `--dir <path>`
- `--json`

Compatibility wrapper:

```bash
openclaw mirror verify-lore
```

## Environment Variables

### Core telemetry flags

- `MIRROR_TELEMETRY_ENABLED`
- `MIRROR_TELEMETRY_SINK_ENABLED`
- `MIRROR_TELEMETRY_SINK_PATH`
- `MIRROR_TELEMETRY_INDEX_DB_PATH`

### Sink configuration

- `MIRROR_TELEMETRY_SINK_ROTATE_BYTES`
- `MIRROR_TELEMETRY_SINK_ROTATE_KEEP`
- `MIRROR_TELEMETRY_SINK_LOCK_ENABLED`
- `MIRROR_TELEMETRY_SINK_LOCK_PATH`

### Runtime identity

- `MIRROR_AGENT_ID`
- `MIRROR_RUN_ID`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_RUN_ID`

### Privacy boundary

- `MIRROR_PRIVACY_BOUNDARY_ENABLED`

### Passport telemetry

- `MIRROR_PASSPORT_TELEMETRY_ENABLED`

## Example Workflow

Standalone Mirror workflow:

```bash
mirror help
mirror status --json
mirror serve --json
mirror verify-lore --json
mirror task list --user-id local-user --json
mirror reminder due --user-id local-user --json
mirror heartbeat evaluate --user-id local-user --json
mirror monk context --user-id local-user --json
mirror monk resume --user-id local-user --json
```

Compatibility diagnostics workflow:

```bash
openclaw mirror doctor
openclaw mirror status
openclaw mirror telemetry tail
```

Compatibility debugging workflow:

```bash
openclaw mirror telemetry index
openclaw mirror telemetry query
```
