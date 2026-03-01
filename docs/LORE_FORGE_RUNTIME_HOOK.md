# Lore Forge Runtime Hook — Optional Tool-Execution Capture

## Overview

The Lore Forge Runtime Hook (`maybeForgeLoreCandidate`) provides an optional, feature-flagged mechanism to capture tool-execution artifacts, score them, and write them to an append-only JSONL file.

## Default Behavior

**OFF by default** — No runtime behavior change.

The hook is gated by the environment variable `MIRROR_LORE_FORGE`.

### Gating Rules

| Env Var             | Value                 | Behavior                                   |
| ------------------- | --------------------- | ------------------------------------------ |
| `MIRROR_LORE_FORGE` | `1` (or truthy)       | Hook executes, candidates written to JSONL |
| `MIRROR_LORE_FORGE` | unset / falsy / other | Hook does nothing (silent)                 |

## Output Path

When enabled, candidates are written to:

- **Default**: `./.mirror/lore_forge_candidates.jsonl`
- **Custom**: `LORE_FORGE_OUT=/path/to/output.jsonl`

Output format is **JSONL** (one candidate per line, newline-delimited JSON).

## Runtime Behavior

### Success Path

1. Tool execution completes (`handleToolExecutionEnd` fires)
2. `maybeForgeLoreCandidate` captures `toolName`, `toolCallId`, `result`
3. Scores candidate with lore_forge library (threshold: 0.5)
4. If score ≥ 0.5, bundles to JSONL via `lore_forge.bundle()`
5. Single log line: `Lore forge candidate generated: tool=X toolCallId=Y`

### Error Path

- **No exceptions**: All errors swallowed
- **Single log line per failure**: `Lore forge candidate failed: tool=X toolCallId=Y error=...`
- **No impact on tool execution**: Tool result unaffected

## Integration Point

**File**: `src/agents/pi-embedded-subscribe.handlers.tools.ts`

**Function**: `handleToolExecutionEnd`

**Location**: After `after_tool_call` hook, before function exit.

```typescript
// Run after_tool_call plugin hook (fire-and-forget)
// ...

// Lore forge candidate hook (optional, gated, no behavior change)
void maybeForgeLoreCandidate(ctx, toolName, toolCallId, result);
```

## Security & Safety

- **Read-only**: Hook does not modify tool results or agent state
- **No routing changes**: Tool execution flow unchanged
- **Fail-safe**: Errors are swallowed, never thrown
- **Minimal side effects**: Only writes to file path if enabled
- **No public logging**: Debug logs only (no user-visible output)

## Usage Example

```bash
# Enable hook (development/testing only)
export MIRROR_LORE_FORGE=1
export LORE_FORGE_OUT=./.mirror/tool-candidates.jsonl

# Run mirror agent
pnpm start
```

After tool executions, inspect output:

```bash
cat .mirror/tool-candidates.jsonl
```

## Future Extensions

This hook is intentionally minimal and isolated. Potential future enhancements (separate PRs):

- Configurable threshold (via env var)
- Blacklist/whitelist tools
- Custom candidate metadata enrichment
- Rate limiting (max candidates per minute)

## Dependencies

- **Library**: `src/plugin-sdk/mirror/lore_forge/` (already shipped in PR#4)
- **Types**: No new type dependencies
- **Runtime**: Pure TypeScript, no native modules

## Files Changed (PR#6)

- `src/mirror/lore_forge_hook.ts` (new)
- `src/agents/pi-embedded-subscribe.handlers.tools.ts` (one-line change)
- `docs/LORE_FORGE_RUNTIME_HOOK.md` (new)

**Scope**: Library-only runtime hook, gated, no behavior change by default.

## Verification

### Build

```bash
cd /home/tommy/mirror-runtime
pnpm -w build
# Expected: exit 0
```

### Run (with hook enabled)

```bash
export MIRROR_LORE_FORGE=1
export LORE_FORGE_OUT=./.mirror/test-candidates.jsonl
node dist/index.js
# Tool executions generate JSONL lines in .mirror/test-candidates.jsonl
```

## Last Updated

2026-02-27 — First version, minimal wiring, OFF by default.
