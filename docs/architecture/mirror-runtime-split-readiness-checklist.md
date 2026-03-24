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
- CLI parity improved materially for status, sync summary, and key operator-truth flows.
- Daemon-side runtime, debug, and health websocket truth is now covered with focused tests.
- Console execution and a few remaining compatibility edges should still be treated as the next ownership seam until one runtime truth is clearly universal.

### 2. Service and operator surfaces

Current score: `yellow`

- [x] Canonical read-only operator surfaces are present and stable.
- [x] Health, runtime, debug, actions, providers, and sync surfaces are consistent in style and ownership.
- [ ] Operator-facing surfaces do not depend on legacy `src/runtime/**` wrappers.
- [x] Additive runtime/status endpoints are covered by service-level tests.

Current reality:

- `/mirror/health`, `/mirror/status`, `/mirror/runtime`, `/mirror/runtime/debug`, `/mirror/actions`, `/mirror/providers`, and `/mirror/sync` are real.
- `mirror status` is daemon-backed and limited to runtime truth only on the canonical Mirror path.
- Websocket transport/control/summary truth is now materially covered at both service and daemon state layers.
- This area is materially improved, but should remain yellow until compatibility-only wrappers stop competing with the canonical operator path and console/runtime ownership is tighter.

### 3. Sync and runtime state visibility

Current score: `yellow`

- [x] Sync peer state is available on a canonical read-only runtime surface.
- [x] `/mirror-sync/peers` and `/mirror-sync/updates` have focused service-level regression coverage.
- [ ] Runtime event surfaces expose enough state to understand sync activity without reading internal modules.
- [x] Sync state is summarized consistently between operator surfaces and runtime state.

Current reality:

- Sync read surfaces are real.
- `/mirror/sync` now exposes read-only peer state from the live registry.
- CLI status parity now covers the daemon-backed sync summary.
- Sync is still a seam because execution state is not fully daemon-owned beyond the current registry and event stream summaries.
- The remaining small gap here is narrower now: understanding sync activity from daemon-owned inspection without reading internal execution modules.

### 4. CLI and service parity

Current score: `yellow`

- [ ] `mirror` CLI commands execute through the same canonical runtime plane used by service ingress.
- [ ] Read operations and mutable operations report the same runtime truth regardless of surface.
- [x] Focused parity tests exist for status, sync, and key tool flows.
- [ ] Operator commands do not silently fall back to stale or compatibility-only logic.

Current reality:

- `mirror status` and sync summary parity are now explicit and tested.
- The canonical `mirror verify-lore` path is aligned on `MIRROR_LORE_DIR`.
- CLI/operator-truth seams are materially improved and now included in the dedicated Mirror smoke lane.
- This should not be treated as fully green until parity is explicit for all critical operator surfaces and compatibility-only entrypoints are no longer misleading.

### 5. Observability ownership

Current score: `red`

- [ ] Metrics are daemon-scoped or runtime-context-scoped.
- [ ] Diagnostics are daemon-scoped or runtime-context-scoped.
- [ ] Debug surfaces do not depend on process-global singleton state.
- [ ] Runtime event inspection and observability tell the same story about execution.

Current reality:

- Observability surfaces exist and are useful.
- Ownership is still process-global enough that this remains the clearest technical pre-split blocker.

### 6. Compatibility quarantine

Current score: `yellow`

- [x] `src/runtime/server.ts`, `src/runtime/brain-chat.ts`, `src/runtime/health.ts`, and `src/cli/mirror-cli.ts` are clearly marked as compatibility shims.
- [x] Mirror-owned runtime modules do not read `OPENCLAW_*` env vars except in explicit compatibility files.
- [x] Focused guardrail coverage exists for the main shims and the remaining legacy runtime entrypoints.
- [x] Canonical operator docs and entrypoints point to Mirror-native paths first.
- [ ] Compatibility code is not the hidden owner of any required runtime behavior.

Current reality:

- Canonical Mirror-owned source no longer reads `OPENCLAW_*` directly outside tests and explicit compatibility paths.
- Canonical entrypoint, operator, and JSON automation docs now point to Mirror-native paths first and describe `openclaw mirror ...` as compatibility-only.
- Compatibility edges are still materially present at entrypoint and wrapper level, but they are now better quarantined and guarded.
- This should remain yellow until the remaining compat entrypoints stop competing with canonical ownership in practice and compatibility code stops owning any required behavior.

### 7. Packaging and build boundary

Current score: `yellow`

- [x] Mirror has a first-class package and build boundary inside the repo.
- [x] Mirror artifacts can be built and tested without treating OpenClaw as the primary product identity.
- [x] Release and packaging paths for Mirror are explicit enough to survive a repo split.

Current reality:

- Mirror now has an explicit package boundary, standalone Linux runtime artifact, extracted-artifact smoke, dist verification, and bootstrap verification.
- Package, bin, and release identity are materially more explicit and guarded than they were before the recent split-readiness PRs.
- The root OpenClaw script surface is now partially quarantined, but not fully removable yet because cleanup-smoke still depends on `pnpm openclaw ...`.
- This area should remain yellow because the package/build boundary is now real, but the remaining blockers are runtime ownership and observability rather than packaging viability.

### 8. CI gates before split

Current score: `yellow`

- [x] A dedicated Mirror runtime smoke lane exists.
- [x] Split-critical runtime-boundary and daemon-truth tests are visible without depending on the full repo matrix.
- [x] Boundary gates prevent new OpenClaw-specific env/config and import/package coupling inside Mirror-owned runtime modules.
- [x] Mirror-specific checks are isolated enough to serve as a true split gate rather than an early smoke lane.

Current reality:

- A dedicated Mirror-owned smoke target now exists and is wired into the dedicated Mirror runtime workflow.
- Runtime-boundary, daemon-truth, websocket, CLI/operator-truth, compatibility-quarantine, packaged-runtime truth, and OpenClaw env/import boundary seams are now visible in a narrow CI lane.
- Dedicated split-readiness gates now include first-class boundary enforcement for new OpenClaw-specific env/config and import/package coupling inside Mirror-owned modules.
- macOS shard-order instability should be treated as a CI lane, not as a product seam in this checklist.

## Current known gaps

The next small, high-signal gaps remain:

1. Move observability ownership under daemon/runtime control.
2. Make any remaining console execution seams explicitly daemon-backed where they are still partial.
3. Continue enriching daemon-owned runtime inspection only where sync/runtime understanding is still thin.
4. Keep parity coverage growing only where a canonical operator/runtime seam is still weak.
5. Continue shrinking compatibility entrypoints from “guarded” to “non-owning in practice.”
6. Keep package/release verification narrow and trustworthy while the remaining runtime seams are closed.

## Do Not Split Before

Do not split before all of these are true:

- Mirrordaemon is the clear runtime owner across the canonical execution surfaces.
- Observability ownership is no longer effectively process-global.
- Compatibility-only wrappers are quarantined or removed from required runtime paths.
- Mirror package/build identity is explicit enough to survive extraction.
- CI can prove the standalone Mirror runtime path without relying on broad repo-level signal.

If one of those remains red, keep building in this repo.
