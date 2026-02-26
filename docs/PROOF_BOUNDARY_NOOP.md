# Proof: Default Output Unchanged

## Test Objective

Demonstrate that when `MIRROR_BOUNDARY` is NOT set (or set to `"0"`), the boundary module is a no-op and does NOT affect engine output.

## Test Method

Run the mirror runtime with `MIRROR_BOUNDARY` unset and capture tool execution output.

### Test Case 1: Boundary Disabled (Default)

```bash
# No MIRROR_BOUNDARY set (default)
deno run --allow-net src/main.ts --tool-read /etc/passwd
```

**Expected Behavior:**
- Tool execution completes normally
- No logs prefixed with `MIRROR_BOUNDARY:` appear
- Output is identical to running without the boundary module

### Test Case 2: Boundary Enabled (Log-Only)

```bash
# MIRROR_BOUNDARY=1 set
MIRROR_BOUNDARY=1 deno run --allow-net src/main.ts --tool-read /etc/passwd
```

**Expected Behavior:**
- Tool execution completes normally
- No output mutations (same text, same order)
- Additional logs appear at `INFO` and `DEBUG` levels:
  - `MIRROR_BOUNDARY: tool=read toolCallId=<id> runId=<id>`
  - `MIRROR_BOUNDARY: tool_result_check tool=read result_type=string`

## Code Review: No-Op When Disabled

The boundary module uses `MIRROR_BOUNDARY_ENABLED` check before any operation:

```typescript
export const MIRROR_BOUNDARY_ENABLED = Deno.env.get("MIRROR_BOUNDARY") === "1";

export function logToolContext(...): void {
  if (!isEnabled()) return;  // No-op
  ctx.log.info(...);
}

export function validateToolResult(...): void {
  if (!isEnabled()) return;  // No-op
  ctx.log.debug(...);
}
```

**Conclusion:** When `MIRROR_BOUNDARY_ENABLED` is `false`, all boundary functions return immediately without side effects. Therefore, engine output is unchanged.

## Hook Location

**File:** `src/agents/pi-embedded-subscribe.handlers.tools.ts`

**Function:** `handleToolExecutionEnd`

**Lines:** After line that commits `pendingMessagingTexts` (around line 250)

**Hooks Applied:**
1. `logToolContext(ctx, toolName, toolCallId)` — Line ~252
2. `validateToolResult(ctx, toolName, result)` — Line ~253

**Effect:** Boundary hooks are called AFTER tool results are committed to state, but BEFORE output is emitted. They do NOT modify state or output.

## Toggle Method

Set the `MIRROR_BOUNDARY` environment variable:

```bash
# Disable (default)
unset MIRROR_BOUNDARY

# Enable
export MIRROR_BOUNDARY=1
```