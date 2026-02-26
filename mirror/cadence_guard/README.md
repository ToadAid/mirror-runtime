# Mirror Cadence Guard

Minimal placeholder implementation for the Mirror boundary overlay.

## Purpose

Provides a feature-flagged boundary layer for MirrorAI runtime that:

- Logs tool executions when enabled
- Logs tool results when enabled
- Does NOT modify output, state, or behavior
- Is fully reversible (disabled by default)

## Module Structure

- `index.ts` — Core boundary logic and hooks
- `README.md` — This file

## Usage

### Environment Variable

Set `MIRROR_BOUNDARY=1` to enable the boundary:

```bash
export MIRROR_BOUNDARY=1
deno run --allow-net src/main.ts
```

### Hooks

The boundary is hooked at ONE interception point in `src/agents/pi-embedded-subscribe.handlers.tools.ts`:

- **Function:** `handleToolExecutionEnd`
- **Line:** After line that commits `pendingMessagingTexts`
- **Hook Points:**
  1. `logToolContext(ctx, toolName, toolCallId)` — Logs tool execution
  2. `validateToolResult(ctx, toolName, result)` — Logs tool result

## Behavior

### When Disabled (Default)

- No logs emitted
- No output modifications
- Full pass-through to engine

### When Enabled

- Logs structured info at `INFO` level for tool executions
- Logs structured debug at `DEBUG` level for tool results
- No state changes
- No output mutations

## Documentation

- [Mirror Boundary Configuration](../docs/MIRROR_BOUNDARY.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [Intercept Points](../notes/INTERCEPT_POINTS.md)