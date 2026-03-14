• # MIRROR RUNTIME — FULL DETACHMENT PLAN

## 1. Final Detachment Goal

“Fully detached from OpenClaw” for this repo means:

- Mirror owns runtime behavior end to end.
  - src/mirrordaemon/ is not just a status sidecar.
  - It becomes the canonical owner of request/session/action lifecycle across
    service, console, CLI, tool execution, sync, and provider calls.
- CLI, service, and console all reflect the same runtime truth.
  - mirror serve
  - mirror chat
  - /mirror/chat
  - /mirror/console/\*
  - /mirror/runtime\*
    all flow through one daemon-centered execution plane.
- Package/build/release boundaries are Mirror-native.
  - no openclaw package identity as the primary package
  - no shared root binary assumptions as the long-term canonical path
  - no CI/release logic that treats Mirror as a sub-feature of OpenClaw
- Env/config boundaries are Mirror-native.
  - Mirror-owned modules stop reading OPENCLAW\_\* except in explicitly quarantined
    compatibility code
  - new runtime code uses only MIRROR\_\*
- Observability and status are daemon-native.
  - metrics, diagnostics, sessions, events, health, status, and runtime debug
    derive from the same runtime authority
- Compatibility wrappers are either removed or quarantined.
  - server.ts
  - brain-chat.ts
  - mirror-cli.ts
    should no longer be part of the main runtime story

## 2. Current Detachment Blockers

### P0 blockers

- Daemon is not the owner of execution, only service-side state/reporting
  - Files: mirrordaemon.ts, mirror_service.ts, mirror_gateway.ts, mirror_cli.ts
  - Why it blocks detachment: runtime truth is split between daemon-backed service
    paths and daemon-free direct execution paths
  - Done looks like: all canonical request execution surfaces create/touch daemon-
    owned runtime sessions and publish daemon-owned lifecycle events
- Console ingress bypasses daemon session tracking
  - Files: mirror_service.ts, console_routes.ts
  - Why it blocks detachment: /mirror/console/api/chat and /mirror/console/api/
    tools/\* do not feed daemon sessions because the middleware only matches /
    mirror/chat and /mirror/tools
  - Done looks like: console API requests create/touch the same daemon sessions as
    direct API requests
- CLI execution bypasses daemon entirely
  - Files: mirror_cli.ts, commands.ts, mirror_gateway.ts
  - Why it blocks detachment: operator chat/tool flows can run without any
    canonical runtime state holder
  - Done looks like: CLI uses a daemon-backed local runtime client or directly
    hosts a daemon context for execution
- Observability is process-global, not daemon-scoped
  - Files: metrics.ts, diagnostics.ts, runtime_state.ts
  - Why it blocks detachment: daemon debug/status is partly built from global
    singleton state instead of daemon-owned state
  - Done looks like: metrics and diagnostics are owned by daemon instance or are
    explicitly attached to daemon runtime context
- Legacy runtime wrappers still exist as real alternate runtime paths
  - Files: server.ts, brain-chat.ts, health.ts
  - Why it blocks detachment: there are still two runtime stories in the repo
  - Done looks like: they are either removed or isolated as explicit compatibility-
    only modules with no canonical callers

### P1 blockers

- Package/build identity is still OpenClaw-rooted
  - Files: package.json, openclaw.mjs, entry.ts
  - Why it blocks detachment: split pain remains high while package, bin, exports,
    and repo metadata are OpenClaw-first
  - Done looks like: Mirror has a first-class package/build boundary even if it
    still lives in this repo
- Operator status is not runtime truth
  - Files: status.ts, commands.ts
  - Why it blocks detachment: mirror status reports telemetry sink/index info, not
    the actual daemon/service runtime
  - Done looks like: operator status reflects daemon, service, sessions, sync,
    provider config, and observability state
- verify-lore defaults are stale relative to current runtime lore root
  - Files: cli.ts, commands.ts
  - Why it blocks detachment: operator tooling does not reflect actual repo/runtime
    lore behavior
  - Done looks like: verification defaults align with MIRROR_LORE_DIR / current
    lore policy
- Daemon event stream is too shallow
  - Files: mirrordaemon.ts, mirror_service.ts, routes.ts, mirror_provider.ts,
    review_engine.ts
  - Why it blocks detachment: runtime events do not actually describe runtime
    behavior well enough for a standalone engine
  - Done looks like: chat/tool/provider/review/sync actions all emit daemon events

### P2 blockers

- Compatibility CLI path still exists under OpenClaw CLI
  - Files: mirror-cli.ts, telemetry_tail/cli.ts
  - Why it blocks detachment: docs and operator surfaces stay dual
  - Done looks like: compatibility path is quarantined or dropped
- Mirror-owned modules still contain OpenClaw naming inheritance
  - Files: mirror_chat_engine.ts, passport.ts, mirror_provider.ts
  - Why it blocks detachment: ownership is conceptually blurred
  - Done looks like: Mirror modules use Mirror-native names/envs only

## 3. Daemon Ownership Gaps

Service ingress:

- Goes through daemon today in mirror_service.ts
- Middleware creates/touches sessions for /mirror/chat and /mirror/tools\*
- This is real and good

Console ingress:

- Bypasses daemon session middleware today
- Console routes are mounted at /mirror/console/... in mirror_service.ts
- Middleware only checks req.path.startsWith("/mirror/chat") and "/mirror/tools"
- So console chat/tool requests do not become daemon sessions

CLI execution:

- Bypasses daemon
- mirror_cli.ts builds a gateway directly
- commands.ts executes chat and tools without service/daemon involvement

Tool execution:

- Service API tool calls go through daemon session middleware first
- CLI tool calls do not
- Console tool calls do not currently

Provider calls:

- Bypass daemon
- mirror_provider.ts records observability, but not daemon runtime events or daemon-
  owned request state

Review flows:

- Bypass daemon
- review_engine.ts logs metrics/diagnostics only

Sync flows:

- Partially integrated
- mirror_service.ts publishes sync.announce and sync.pull
- sync_manager.ts itself does not depend on daemon

Observability hooks:

- Not daemon-owned
- Gateway, provider, review, console, sync update global observability stores
- Daemon debug reads those globals in runtime_state.ts

What currently goes through mirrordaemon:

- service boot snapshot
- service runtime summaries
- service-side session creation/touch for /mirror/chat and /mirror/tools
- runtime health requests
- sync announce/pull events
- SSE runtime event stream
- session listing/debug

What still bypasses it:

- CLI chat
- CLI tool execution
- console chat
- console tool execution
- provider call lifecycle
- review lifecycle
- most sync lifecycle
- observability state ownership

What must be rerouted before detachment is complete:

- console ingress
- CLI execution
- provider lifecycle emission
- tool/review lifecycle emission
- observability ownership
- ideally sync manager state reporting

## 4. Compatibility Boundary Cleanup

- server.ts
  - Current role: legacy runtime HTTP wrapper for /health and /api/brain/chat
  - Who still calls it: no in-repo canonical callers found
  - Recommendation: quarantine now, then delete
  - Deletion prerequisites:
    - confirm no external supported clients depend on /api/brain/chat
    - move any remaining needed replay/validation behavior elsewhere if still
      required
- brain-chat.ts
  - Current role: compatibility-only proxy wrapper around provider call, with
    replay cache and legacy logging
  - Who still calls it: server.ts, tests
  - Recommendation: quarantine temporarily
  - Deletion prerequisites:
    - either retire legacy /api/brain/chat
    - or explicitly move replay protection into Mirror provider/runtime if it
      still matters
- mirror-cli.ts
  - Current role: OpenClaw CLI registration for compatibility-only Mirror telemetry
    commands
  - Who still calls it: not visible from Mirror-native runtime flow
  - Recommendation: quarantine now
  - Deletion prerequisites:
    - decide whether openclaw mirror telemetry tail remains supported at all

Other compatibility / near-dead paths:

- health.ts
  - tied to legacy runtime server
  - quarantine with server.ts
- telemetry_tail/cli.ts
  - explicitly compatibility-only
  - quarantine
- skills/discover.ts
  - archived builtins for tests/compat refs
  - retain for now, but keep out of canonical surface

## 5. Package / Build / Release Detachment

What still ties package/build to OpenClaw:

- package.json
  - package name is openclaw
  - repository points to openclaw/openclaw
  - exports are OpenClaw-first
  - both mirror and openclaw bins ship from the same package
- openclaw.mjs
  - root OpenClaw bin remains primary packaging artifact
- entry.ts
  - OpenClaw main entrypoint still drives repo runtime identity
- CI in .github/workflows/ci.yml
  - full-repo OpenClaw CI
  - no dedicated Mirror detachment gate
- build scripts in package.json
  - one shared dist/build path

What must change before a clean standalone split:

- Mirror-native package manifest or package boundary
- Mirror-native build artifact ownership
- dedicated Mirror CI lane
- explicit compatibility quarantine for OpenClaw bins/entrypoints
- reduced dependency of Mirror runtime code on OpenClaw root boot logic

Minimum viable Mirror-native package/build boundary:

- mirror remains the canonical runtime binary
- Mirror-native entrypoints build independently of openclaw entrypoints
- compatibility artifacts may still exist, but under an explicit compat boundary
- CI must have a Mirror-only smoke lane for:
  - build
  - service boot
  - CLI
  - daemon/runtime endpoints

## 6. Env / Config Detachment

Remaining OpenClaw-shaped env/config references in Mirror-owned modules:

- mirror_chat_engine.ts
  - key: OPENCLAW_LOG_LEVEL
  - type: fallback / hard read in canonical Mirror module
  - replacement: MIRROR_LOG_LEVEL
- passport.ts
  - keys: OPENCLAW_AGENT_ID, OPENCLAW_AGENT, OPENCLAW_RUN_ID,
    OPENCLAW_TRAVELER_NAME
  - type: fallback compatibility envs
  - replacement: prefer MIRROR_AGENT_ID, MIRROR_RUN_ID, MIRROR_TRAVELER_NAME;
    compatibility fallback should be isolated or eventually dropped
- doctor/checks.ts
  - keys include OPENCLAW_AGENT_ID, OPENCLAW_AGENT, OPENCLAW_RUN_ID
  - type: compatibility-oriented checks
  - replacement: Mirror-native keys only in canonical path, compatibility warnings
    only in compat tools
- mirror-entry.ts
  - mentions openclaw mirror ... in help text
  - type: cosmetic inheritance / compatibility messaging
  - replacement: move that note to compat docs or remove once compat wrapper is
    quarantined

Clean rule:

- Allowed compatibility envs:
  - only inside explicitly quarantined compatibility modules under src/runtime/ or
    src/cli/
- Forbidden new env references:
  - any new OPENCLAW\_\* reads inside src/mirrordaemon/, src/mirror-service/, src/
    mirror-runtime/, src/mirror-provider/, src/mirror-gateway/, src/mirror-
    console/, src/mirror-observability/, src/mirror-sync/, src/mirror-user-
    workspace/
- Preferred naming:
  - MIRROR\_\* only for canonical runtime modules

## 7. Operator Truth Gaps

Accurate today:

- /mirror/health and /mirror/status in mirror_service.ts
  - mostly reflect current service runtime
- /mirror/runtime, /mirror/runtime/sessions, /mirror/runtime/debug
  - accurate for daemon-backed service state
- /mirror/metrics, /mirror/diagnostics
  - accurate for process-global observability state

Misleading today:

- mirror status
  - status.ts
  - shows telemetry sink/index state, not actual runtime/daemon/service truth
- mirror verify-lore
  - defaults to lore/manifest.json and lore/canonical in cli.ts
  - does not match current MIRROR_LORE_DIR-driven runtime reality
- session visibility
  - /mirror/runtime/sessions is incomplete because console and CLI execution do not
    feed it
- event visibility
  - /mirror/runtime/events exists, but runtime events are too sparse to describe
    actual execution
- sync visibility
  - sync endpoints are real, but sync state is not daemon-owned and not fully
    represented in runtime state

What must change so operators see one canonical runtime truth:

- mirror status must either query the running service/daemon or expose daemon-runtime
  status locally
- session tracking must include console and CLI
- runtime events must include chat/tool/provider/review/sync lifecycle
- lore verification defaults must match actual Mirror lore root behavior
- operator docs/help must stop presenting telemetry-only status as runtime status

## 8. Observability Detachment

What is daemon-scoped today:

- boot snapshot
- session registry
- event stream buffer

What is still singleton/global:

- metrics in metrics.ts
- diagnostics in diagnostics.ts
- structured logs in tracing.ts

Status/debug payload builders:

- runtime_state.ts mixes daemon state with global metrics/diagnostics
- that is transitional, not fully detached

What detachment requires:

- observability context attached to daemon instance or service runtime context
- daemon event stream fed from real runtime activity, not just session and health
  events
- runtime debug derived from one runtime authority, not stitched from daemon +
  globals

Missing correlation:

- yes
- there is no strong per-session or per-request correlation between:
  - daemon sessions
  - observability diagnostics
  - provider calls
  - tool executions
  - review decisions

That is a real detachment blocker because a standalone engine needs one coherent
runtime truth.

## 9. Detachment-First Execution Order

1. P0, medium
   - Why now: console currently bypasses daemon sessions
   - Main files: mirror_service.ts, console_routes.ts
   - Done means: /mirror/console/api/chat and /mirror/console/api/tools/\* create/
     touch daemon sessions and emit session activity
2. P0, high
   - Why now: CLI is still outside canonical runtime state
   - Main files: mirror_cli.ts, commands.ts, mirror_gateway.ts, likely new daemon-
     facing execution helper
   - Done means: canonical CLI execution routes through daemon-backed runtime
     context, not a daemon-free direct path
3. P0, medium
   - Why now: daemon event stream is too weak to be the runtime backbone
   - Main files: mirrordaemon.ts, routes.ts, mirror_provider.ts, review_engine.ts,
     sync_manager.ts
   - Done means: daemon events exist for chat start/finish, tool execute/result,
     provider call start/finish/fail, review decision, sync actions
4. P0, medium
   - Why now: observability is still global and stitched onto daemon
   - Main files: metrics.ts, diagnostics.ts, runtime_state.ts, likely mirrordaemon
     types
   - Done means: metrics/diagnostics are runtime-context or daemon-instance scoped
     and exposed through daemon summaries
5. P0, low
   - Why now: current runtime event surface lacks direct protection
   - Main files: mirror_service.test.ts, mirrordaemon.test.ts
   - Done means: service tests cover /mirror/runtime/events and session/event
     lifecycle across chat/tool flows
6. P1, low
   - Why now: remove OpenClaw env drift in canonical modules
   - Main files: mirror_chat_engine.ts, passport.ts, doctor/checks.ts
   - Done means: canonical Mirror modules use MIRROR\_\* only; any OpenClaw fallbacks
     live in explicit compat code
7. P1, medium
   - Why now: operator-facing truth is currently split
   - Main files: commands.ts, status.ts, mirror_service.ts
   - Done means: mirror status reports actual daemon/service/runtime truth, not just
     telemetry files
8. P1, low
   - Why now: verify-lore defaults are stale
   - Main files: cli.ts, commands.ts
   - Done means: verification defaults align with MIRROR_LORE_DIR and current lore
     layout
9. P1, low
   - Why now: compatibility wrappers still muddy ownership
   - Main files: server.ts, brain-chat.ts, health.ts, mirror-cli.ts
   - Done means: wrappers are quarantined behind an explicit compat boundary or
     removed if unused
10. P1, medium

- Why now: package/build boundary still says OpenClaw
- Main files: package.json, mirror.mjs, openclaw.mjs, CI workflows
- Done means: Mirror has a clearly defined first-class package/build/test lane, even
  if the repo split has not happened yet

11. P2, medium

- Why now: reduce long-term split pain after runtime truth is fixed
- Main files: CI workflows, build scripts, docs/debug/runtime docs
- Done means: Mirror-only smoke/build/test path exists and is enforced

## 10. Safe Stop Line

The repo is “detached enough” when all of these pass:

- Pass: canonical execution surfaces all feed daemon runtime state
  - service API
  - console API
  - CLI
- Pass: daemon event stream includes real runtime lifecycle, not just session/health/
  sync crumbs
- Pass: observability used in runtime/debug is daemon-scoped or runtime-context
  scoped
- Pass: mirror status reflects actual runtime truth
- Pass: mirror verify-lore reflects actual lore-root behavior
- Pass: compatibility wrappers are quarantined or no longer canonical
- Pass: canonical Mirror modules no longer read OPENCLAW\_\*
- Pass: Mirror has its own explicit build/test lane

If any of those fail, the repo is not detached enough for major new runtime features
or for a clean Mirror OS boundary.

## 11. First PR Recommendation

PR title:

- Mirrordaemon: make console and CLI execution daemon-backed

Purpose:

- close the most important ownership gap first by making all operator-facing
  execution surfaces feed the same runtime sessions and event model

Files likely touched:

- mirror_service.ts
- console_routes.ts
- mirror_cli.ts
- commands.ts
- mirrordaemon.ts
- tests in mirror_service.test.ts and mirror_cli.test.ts

Risks:

- session semantics may change for CLI/console flows
- some tests may assume direct gateway execution
- may require a new runtime-context helper instead of naive direct wiring

Why this should be first:

- it fixes the core truth problem
- until all execution surfaces feed the daemon, every later detachment step is
  working around a split runtime model

## 12. Appendix — Detachment Map

Canonical Mirror-native subsystems:

- src/mirrordaemon
- src/mirror-service
- src/mirror-runtime
- src/mirror-provider
- src/mirror-gateway
- src/mirror-console
- src/mirror-observability
- src/mirror-sync
- src/mirror-user-workspace
- core runtime-facing Mirror modules under src/mirror

Remaining OpenClaw-boundary subsystems:

- package.json
- openclaw.mjs
- src/entry.ts
- src/runtime/server.ts
- src/runtime/brain-chat.ts
- src/runtime/health.ts
- src/cli/mirror-cli.ts

Transitional subsystems that must be finished before split:

- src/mirrordaemon: real, but not yet owner of all runtime behavior
- src/mirror-cli: real operator surface, but daemon-bypassing
- src/mirror-console: real web surface, but partially outside daemon session truth
- src/mirror-observability: useful, but global rather than daemon-native
- src/mirror/status: operator-facing, but not runtime-truthful yet
