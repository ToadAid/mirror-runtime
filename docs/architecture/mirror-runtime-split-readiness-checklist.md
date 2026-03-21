# Mirror Runtime Split-Readiness Checklist

This checklist defines what should be true before Mirror Runtime is split out of the current repo.

It is intentionally operational.

- It is for sequencing small PRs.
- It is not a broad redesign plan.
- It should track current repo reality, not an idealized future architecture.

## Purpose

Use this checklist to decide whether a proposed PR improves split-readiness, preserves it, or widens scope without reducing split risk.

The core rule remains:

1. detach first
2. split second
3. expand third

## How to use this checklist

- Prefer the next smallest yellow or red item that can be fixed in one reviewable PR.
- Prefer additive read surfaces and focused regression tests before broad refactors.
- Re-score the touched section after each merged PR.
- Do not mark a section green if the canonical runtime path still depends on compatibility-only wrappers or duplicate execution planes.

## Split-Readiness Scorecard

### Green

- The seam is explicit.
- The canonical Mirror path is clear.
- The behavior is covered by focused tests.
- A repo split would not require untangling hidden ownership in this area.

### Yellow

- The seam exists, but ownership is still partial, duplicated, or weakly tested.
- A small follow-up PR can improve the boundary without redesigning the runtime.

### Red

- Ownership is still mixed or misleading.
- Canonical and compatibility paths still compete.
- A split here would copy technical debt into a new repo boundary.

## Checklist

### 1. Runtime ownership seams

Current score: `yellow`

- [ ] Mirrordaemon is the canonical state owner for service, console, and CLI execution paths.
- [ ] Session creation and touch behavior are consistent across `/mirror/chat`, `/mirror/tools/*`, console API paths, and CLI execution.
- [ ] Runtime summaries are built from daemon-owned state rather than sidecar module state.
- [ ] New runtime features land on the daemon-backed path first, not on compatibility wrappers.

Current reality:

- Service runtime state is real and daemon-backed.
- Console and CLI parity improved materially, but should still be treated as a seam until one runtime truth is clearly universal.

### 2. Service and operator surfaces

Current score: `yellow`

- [ ] Canonical read-only operator surfaces are present and stable.
- [ ] Health, runtime, debug, actions, providers, and sync surfaces are consistent in style and ownership.
- [ ] Operator-facing surfaces do not depend on legacy `src/runtime/**` wrappers.
- [ ] Additive runtime/status endpoints are covered by service-level tests.

Current reality:

- `/mirror/health`, `/mirror/status`, `/mirror/runtime`, `/mirror/runtime/debug`, `/mirror/actions`, `/mirror/providers`, and `/mirror/sync` are real.
- This area is close, but operator truth is still uneven in CLI status and verify-lore flows.

### 3. Sync and runtime state visibility

Current score: `yellow`

- [ ] Sync peer state is available on a canonical read-only runtime surface.
- [ ] `/mirror-sync/peers` and `/mirror-sync/updates` have focused service-level regression coverage.
- [ ] Runtime event surfaces expose enough state to understand sync activity without reading internal modules.
- [ ] Sync state is summarized consistently between operator surfaces and runtime state.

Current reality:

- Sync read surfaces are real.
- `/mirror/sync` now exposes read-only peer state from the live registry.
- Sync is still a seam because execution state is not fully daemon-owned beyond the current registry and event stream summaries.

### 4. CLI and service parity

Current score: `yellow`

- [ ] `mirror` CLI commands execute through the same canonical runtime plane used by service ingress.
- [ ] Read operations and mutable operations report the same runtime truth regardless of surface.
- [ ] Focused parity tests exist for status, sync, and key tool flows.
- [ ] Operator commands do not silently fall back to stale or compatibility-only logic.

Current reality:

- CLI coverage is much better than before, but this should not be treated as fully green until parity is explicit for all critical operator surfaces.

### 5. Observability ownership

Current score: `red`

- [ ] Metrics are daemon-scoped or runtime-context-scoped.
- [ ] Diagnostics are daemon-scoped or runtime-context-scoped.
- [ ] Debug surfaces do not depend on process-global singleton state.
- [ ] Runtime event inspection and observability tell the same story about execution.

Current reality:

- Observability surfaces exist and are useful.
- Ownership is still process-global enough that this remains a pre-split blocker.

### 6. Compatibility quarantine

Current score: `red`

- [ ] `src/runtime/server.ts`, `src/runtime/brain-chat.ts`, `src/runtime/health.ts`, and `src/cli/mirror-cli.ts` are either quarantined clearly or removed.
- [ ] Mirror-owned runtime modules do not read `OPENCLAW_*` env vars except in explicit compatibility files.
- [ ] Canonical operator docs and entrypoints point to Mirror-native paths first.
- [ ] Compatibility code is not the hidden owner of any required runtime behavior.

Current reality:

- Compatibility edges are still materially present at entrypoint and env-boundary level.
- This is still one of the clearest blockers to a clean split.

### 7. Packaging and build boundary

Current score: `red`

- [ ] Mirror has a first-class package and build boundary inside the repo.
- [ ] Mirror artifacts can be built and tested without treating OpenClaw as the primary product identity.
- [ ] Release and packaging paths for Mirror are explicit enough to survive a repo split.

Current reality:

- Mirror runtime behavior is increasingly standalone.
- Package, bin, and release identity are still shared enough that splitting now would be premature.

### 8. CI gates before split

Current score: `red`

- [ ] A dedicated Mirror runtime smoke lane exists.
- [ ] A boundary gate prevents new OpenClaw-specific env/config coupling inside Mirror-owned runtime modules.
- [ ] Split-critical runtime tests are visible without depending on the full repo matrix.

Current reality:

- Runtime tests exist.
- Dedicated split-readiness gates are still missing.

## Current known gaps

The next small, high-signal gaps remain:

1. Make any remaining console and CLI execution seams explicitly daemon-backed where they are still partial.
2. Continue enriching daemon-owned runtime events where operator/runtime inspection is still thin.
3. Move observability ownership under daemon/runtime control.
4. Remove OpenClaw env usage from canonical Mirror runtime modules.
5. Fix operator truth for `mirror status`.
6. Fix operator truth for `mirror verify-lore`.
7. Quarantine or retire compatibility-only runtime wrappers.
8. Create a Mirror-native package/build boundary.
9. Add dedicated Mirror runtime CI gates.

## Do Not Split Before

Do not split before all of these are true:

- Mirrordaemon is the clear runtime owner across the canonical execution surfaces.
- Observability ownership is no longer effectively process-global.
- Compatibility-only wrappers are quarantined or removed from required runtime paths.
- Mirror package/build identity is explicit enough to survive extraction.
- CI can prove the standalone Mirror runtime path without relying on broad repo-level signal.

If one of those remains red, keep building in this repo.
