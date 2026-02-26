# Mirror Runtime Boundary

This repository is a fork of OpenClaw used as the MirrorAI runtime engine for ToadAid.

## Rules (The Law)
- Keep upstream engine intact by default.
- All Mirror-specific logic lives under /mirror (overlay boundary).
- No silent behavior changes: any interception must be explicit, documented, and testable.
- PR-only workflow. No direct pushes to main.

## Scope
Phase 1 (current): document boundaries and identify candidate interception points (no code hooks yet).
Phase 2: add a minimal interception hook behind a feature flag.
Phase 3: add Cadence Guard + policy enforcement.

## Upstream
- Upstream remote: openclaw/openclaw
- Our fork: ToadAid/mirror-runtime
