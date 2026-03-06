# Mirror Operator Guide

## Mirror Runtime Overview

Mirror runtime is a diagnostics and telemetry layer for OpenClaw runtime behavior.

It provides operators with read-only inspection tools for:

- Runtime diagnostics and health checks
- Telemetry capture and event inspection
- Telemetry replay and analysis workflows
- Runtime identity reporting through passport

These tools are intended to inspect Mirror runtime behavior without modifying runtime state.

## Mirror CLI Commands

### doctor

Command:

```bash
openclaw mirror doctor
```

Purpose:

- Run runtime health checks
- Verify telemetry configuration
- Verify SQLite index accessibility
- Confirm environment configuration

Options:

- `--json`
- `--ndjson-path <path>`
- `--db <path>`

### status

Command:

```bash
openclaw mirror status
```

Purpose:

- Provide a quick runtime summary
- Show runtime identity context
- Show telemetry configuration state

Options:

- `--json`

### passport

Command:

```bash
openclaw mirror passport
```

Purpose:

- Print the runtime identity document
- Help debug agent identity and run identity

Options:

- `--json`

### telemetry tail

Command:

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

Command:

```bash
openclaw mirror telemetry replay
```

Purpose:

- Replay telemetry history from sink files

### telemetry index

Command:

```bash
openclaw mirror telemetry index
```

Purpose:

- Build a SQLite telemetry index from telemetry sink data

### telemetry query

Command:

```bash
openclaw mirror telemetry query
```

Purpose:

- Query events from the telemetry SQLite index

### telemetry reflect

Command:

```bash
openclaw mirror telemetry reflect
```

Purpose:

- Produce summarized runtime reflection from telemetry data

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

Basic runtime check workflow:

```bash
openclaw mirror doctor
openclaw mirror status
openclaw mirror telemetry tail
```

Example debugging workflow:

```bash
openclaw mirror telemetry index
openclaw mirror telemetry query
```
