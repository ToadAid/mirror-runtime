# Mirror Runtime Final Detachment Audit

Last audited: March 13, 2026

## Status

Mirror Runtime is now detached at the runtime-behavior layer and Mirror-primary at the root package boundary.

That is true for:

- daemon-owned runtime state
- service ingress
- console chat/tool ingress
- CLI execution
- observability ownership
- operator status truth
- standalone Mirror build/test/smoke paths

It is still partially shared with OpenClaw through:

- the retained `openclaw` compatibility binary
- explicit compatibility workspace/package shims
- root repository metadata still pointing at the upstream OpenClaw repo

## Canonical Runtime Path

The canonical detached runtime path is now:

Mirror CLI / Mirror Service / Mirror Console
→ Mirrordaemon
→ Mirror Chat Engine
→ Mirror Provider Runtime
→ Model

Canonical modules:

- [src/mirrordaemon/index.ts](/home/tommy/mirror-runtime/src/mirrordaemon/index.ts)
- [src/mirror-service/index.ts](/home/tommy/mirror-runtime/src/mirror-service/index.ts)
- [src/mirror-runtime/index.ts](/home/tommy/mirror-runtime/src/mirror-runtime/index.ts)
- [src/mirror-provider/index.ts](/home/tommy/mirror-runtime/src/mirror-provider/index.ts)
- [src/mirror-gateway/index.ts](/home/tommy/mirror-runtime/src/mirror-gateway/index.ts)
- [src/mirror-cli/index.ts](/home/tommy/mirror-runtime/src/mirror-cli/index.ts)
- [src/mirror-console/index.ts](/home/tommy/mirror-runtime/src/mirror-console/index.ts)
- [src/mirror-observability/index.ts](/home/tommy/mirror-runtime/src/mirror-observability/index.ts)
- [src/mirror-sync/index.ts](/home/tommy/mirror-runtime/src/mirror-sync/index.ts)
- [src/mirror-package.ts](/home/tommy/mirror-runtime/src/mirror-package.ts)

## What Is Fully Detached Now

### Runtime ownership

`src/mirrordaemon/` now owns:

- boot snapshot
- session registry
- runtime state
- event stream
- debug/runtime summaries
- daemon-scoped observability context

### Unified runtime truth

All primary execution surfaces now feed daemon-backed runtime truth:

- service API:
  - `POST /mirror/chat`
  - `POST /mirror/tools/:tool_name`
- console API:
  - `POST /mirror/console/api/chat`
  - `POST /mirror/console/api/tools/:tool_name`
- CLI commands through:
  - [src/mirror-service/runtime_host.ts](/home/tommy/mirror-runtime/src/mirror-service/runtime_host.ts)

### Operator truth

The operator-facing truth is now daemon-backed:

- `mirror status`
- `/mirror/health`
- `/mirror/status`
- `/mirror/runtime`
- `/mirror/runtime/sessions`
- `/mirror/runtime/debug`
- `/mirror/runtime/events`
- `/mirror/metrics`
- `/mirror/diagnostics`

### Detached build/test path

Mirror now has a dedicated internal package/build boundary:

- [package.json](/home/tommy/mirror-runtime/packages/mirror-runtime/package.json)
- [tsdown.mirror.config.ts](/home/tommy/mirror-runtime/tsdown.mirror.config.ts)
- [vitest.mirror.config.ts](/home/tommy/mirror-runtime/vitest.mirror.config.ts)

Dedicated commands:

- `pnpm build:mirror`
- `pnpm test:mirror`
- `pnpm smoke:mirror`

Dedicated CI lane:

- [mirror-runtime-ci.yml](/home/tommy/mirror-runtime/.github/workflows/mirror-runtime-ci.yml)

## Compatibility Decision

Old compat shim paths are still supported temporarily.

They are no longer canonical.

They now exist only as explicit OpenClaw compatibility shims:

- [src/compat/openclaw/runtime/server.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/server.ts)
- [src/compat/openclaw/runtime/brain-chat.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/brain-chat.ts)
- [src/compat/openclaw/runtime/health.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/health.ts)
- [src/compat/openclaw/cli/mirror-cli.ts](/home/tommy/mirror-runtime/src/compat/openclaw/cli/mirror-cli.ts)

Thin shim files remain at legacy paths:

- [src/runtime/server.ts](/home/tommy/mirror-runtime/src/runtime/server.ts)
- [src/runtime/brain-chat.ts](/home/tommy/mirror-runtime/src/runtime/brain-chat.ts)
- [src/runtime/health.ts](/home/tommy/mirror-runtime/src/runtime/health.ts)
- [src/cli/mirror-cli.ts](/home/tommy/mirror-runtime/src/cli/mirror-cli.ts)

Decision:

- supported for compatibility only
- not part of the canonical Mirror runtime
- safe to remove later once external callers are retired

## Package Identity Reality

Mirror is now the primary root package identity.

Root package:

- [package.json](/home/tommy/mirror-runtime/package.json)

Current root reality:

- package name is now `mirror-runtime`
- root main export is now `dist/mirror-package.js`
- root `cli-entry` now points to `mirror.mjs`
- root still exposes `openclaw` as a compatibility bin

Explicit OpenClaw compatibility package:

- [package.json](/home/tommy/mirror-runtime/packages/openclaw/package.json)

Conclusion:

- Mirror is now the primary runtime surface
- OpenClaw is now an explicit compatibility package, not the primary root identity

## Canonical Entry Points

Use these as the detached Mirror-native entrypoints:

### CLI

- [mirror.mjs](/home/tommy/mirror-runtime/mirror.mjs)
- [src/mirror-entry.ts](/home/tommy/mirror-runtime/src/mirror-entry.ts)
- [src/mirror-cli/mirror_cli.ts](/home/tommy/mirror-runtime/src/mirror-cli/mirror_cli.ts)

### Service

- [src/mirror-service/mirror_service.ts](/home/tommy/mirror-runtime/src/mirror-service/mirror_service.ts)
- [src/mirror-service/runtime_host.ts](/home/tommy/mirror-runtime/src/mirror-service/runtime_host.ts)

### Package boundary

- [src/mirror-package.ts](/home/tommy/mirror-runtime/src/mirror-package.ts)
- [package.json](/home/tommy/mirror-runtime/packages/mirror-runtime/package.json)

### Detached CI/smoke

- [mirror-runtime-ci.yml](/home/tommy/mirror-runtime/.github/workflows/mirror-runtime-ci.yml)
- [ci-mirror-smoke.ts](/home/tommy/mirror-runtime/scripts/ci-mirror-smoke.ts)

## Verification Completed

Verified in current repo state:

- `pnpm build:mirror`
- `pnpm test:mirror`
- `pnpm smoke:mirror`
- `pnpm vitest run src/mirror-service/mirror_service.test.ts src/mirror-cli/mirror_cli.test.ts`

Truth checks now cover:

- service API to daemon state
- console API to daemon state
- CLI execution to daemon state
- runtime/debug/session alignment
- observability alignment
- status alignment

## Remaining Shared Boundary

The remaining shared boundary is now mostly repo-level, not runtime-level.

Still shared:

- root package identity
- root OpenClaw entrypoints
- broad OpenClaw workspace/plugin ecosystem
- repo metadata and release assumptions

Not still shared in the canonical runtime path:

- chat execution ownership
- provider invocation ownership
- status/debug ownership
- daemon session ownership
- detached service boot path

## Practical Readout

If the question is:

"Can new major Mirror runtime work continue on the detached runtime core now?"

The answer is yes.

If the question is:

"Is this repo already Mirror-primary at the runtime and package boundary?"

The answer is yes.

If the question is:

"Is every OpenClaw-era compatibility surface gone?"

The answer is no.

The remaining shared surface is compatibility and release/repo metadata, not canonical runtime ownership.
