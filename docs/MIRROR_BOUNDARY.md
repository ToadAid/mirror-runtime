# Mirror Boundary Configuration

## MIRROR_BOUNDARY

Controls whether the Mirror boundary overlay is active.

**Default:** Disabled (`MIRROR_BOUNDARY` not set, or set to `"0"`)

**Enabled:** Set to `"1"`:

```bash
export MIRROR_BOUNDARY=1
```

**Behavior:**
- When enabled, the boundary logs tool executions and tool results for audit purposes.
- Does NOT modify output, state, or behavior.
- Fully reversible (disabled by default).
- Safe to enable during development and debugging.

**Scope:**
- Affects `mirror/cadence_guard` module only.
- No changes to engine behavior when disabled.
- No changes to engine behavior when enabled (log-only).

## Example Usage

```bash
# Start with boundary disabled (default)
deno run --allow-net src/main.ts

# Start with boundary enabled (log-only audit)
MIRROR_BOUNDARY=1 deno run --allow-net src/main.ts

# Use in Docker
docker run -e MIRROR_BOUNDARY=1 toadai/mirror-runtime
```

## Documentation

- [Architecture](./ARCHITECTURE.md) — High-level design
- [Intercept Points](../notes/INTERCEPT_POINTS.md) — Boundary hook locations
- [Mirror Module](../mirror/README.md) — Overview of mirror/ directory