• # MIRROR RUNTIME — CURRENT REPO REPORT

## 1. Executive Summary

- The repo now has a real Mirror-native runtime spine: src/mirrordaemon/
  mirrordaemon.ts, src/mirror-service/mirror_service.ts, src/mirror-runtime/
  mirror_chat_engine.ts, and src/mirror-provider/mirror_provider.ts.
- src/mirrordaemon/ is real and in use. It owns boot snapshot, session registry, in-
  memory event stream, runtime summary builders, and debug/health payload builders.
- The canonical HTTP service path is now src/mirror-service/mirror_service.ts, not
  src/runtime/server.ts.
- Daemon-backed endpoints are real: /mirror/runtime, /mirror/runtime/sessions, /
  mirror/runtime/debug, /mirror/runtime/events in src/mirror-service/
  mirror_service.ts.
- The standalone mirror binary is real via mirror.mjs -> src/mirror-entry.ts -> src/
  mirror-cli/mirror_cli.ts.
- The runtime is not fully daemon-owned in behavior. CLI chat/tool flows still
  execute directly through src/mirror-gateway/mirror_gateway.ts and bypass daemon
  session/state tracking.
- Mirrordaemon is the canonical state holder for the service process only. It is not
  yet the canonical coordinator for all Mirror execution surfaces.
- Significant OpenClaw coupling remains at package/build/entry/compatibility level:
  package.json, openclaw.mjs, src/entry.ts, src/runtime/server.ts, src/runtime/
  brain-chat.ts, src/cli/mirror-cli.ts.
- Service, console, sync, observability, lore retrieval, review, and workspace
  tooling are all real, but they are still composed side-by-side rather than daemon-
  centered.
- Mirror Runtime today is best described as: mostly standalone with compatibility
  edges, but still materially coupled at repo/build boundary.
- Recommendation: keep building in this repo.
- Reason: the runtime boundary is becoming real, but the split boundary is not clean
  yet. Packaging, CI, legacy wrappers, and daemon ownership are still transitional.

## 2. Runtime Entry Points

- mirror.mjs: standalone mirror binary bootstrap. Canonical. Required for standalone
  CLI use.
- src/mirror-entry.ts: standalone Mirror CLI entry. Canonical. Required for
  mirror ....
- src/mirror-cli/mirror_cli.ts: CLI runner for chat, find, fact, interpret, forge,
  commit, status, verify-lore, serve, sync, task, reminder, heartbeat, monk.
  Canonical for CLI behavior. Required for operator use.
- src/mirror-service/mirror_service.ts: standalone HTTP service bootstrap. Canonical
  service entrypoint. Required for service mode.
- src/mirror-service/lifecycle.ts: service lifecycle init/shutdown for lore
  discovery, index refresh, memory DB init. Canonical support path. Required by
  service.
- src/mirrordaemon/mirrordaemon.ts: daemon boot path and in-memory runtime core.
  Canonical runtime core. Required by service.
- src/mirror-gateway/routes.ts: Mirror API routes for /mirror/tools and /mirror/
  chat. Canonical service API surface. Required by service.
- src/mirror-console/console_routes.ts: console routes under /mirror/console.
  Canonical web console surface. Optional for headless operation.
- src/mirror-observability/observability_server.ts: /mirror/metrics and /mirror/
  diagnostics. Canonical observability surface. Optional but part of normal service.
- src/mirror-sync/sync_manager.ts: /mirror-sync/announce, /mirror-sync/updates, /
  mirror-sync/pull, /mirror-sync/peers. Canonical sync surface. Optional depending
  on deployment.
- src/runtime/server.ts: legacy /health and /api/brain/chat wrapper. Compatibility-
  only. Not required for normal Mirror operation.
- src/runtime/brain-chat.ts: legacy OpenAI-style brain proxy wrapper. Compatibility-
  only. Not required for canonical Mirror service.
- src/cli/mirror-cli.ts: OpenClaw-side openclaw mirror telemetry ... registration.
  Compatibility-only. Not required for standalone Mirror.

## 3. Canonical Runtime Core

- src/mirrordaemon/boot_snapshot.ts owns boot snapshot creation. It captures config,
  enabled surfaces, lore/workspace/sync/provider/observability readiness.
- src/mirrordaemon/session_registry.ts owns in-memory session creation, touch,
  listing, and close.
- src/mirrordaemon/event_stream.ts owns in-memory runtime events with subscription
  and recent backlog.
- src/mirrordaemon/runtime_state.ts builds runtime, health, and debug payloads from
  daemon state plus global observability state.
- src/mirrordaemon/status_api.ts and src/mirrordaemon/debug_api.ts expose summary
  builders used by the service.
- src/mirrordaemon/mirrordaemon.ts composes boot snapshot + sessions + event stream
  and emits runtime.started, session.created, session.touched, session.closed.

What it centralizes today:

- boot configuration snapshot
- enabled surface list
- readiness summary
- in-memory session list
- in-memory event backlog/subscriptions

What APIs it exposes today:

- getBootSnapshot
- createSession
- getSession
- listSessions
- touchSession
- closeSession
- publishRuntimeEvent
- subscribeRuntimeEvents
- getRecentEvents

What is missing for a complete standalone core:

- no central ownership of chat executions, tool executions, provider calls, review
  flows, or sync state
- no daemon-owned provider/session execution graph
- no persistence for sessions or runtime events
- no idle expiry or automatic session closing; closeSession exists but is unused
  outside tests
- no daemon-owned action registry or policy engine
- no daemon-owned health probes beyond boot snapshot plus injected counts
- no per-daemon observability store; debug pulls from global singleton metrics/
  diagnostics
- no lifecycle events for shutdown, faults, provider failures, or tool runs

## 4. Service Integration Reality

- src/mirror-service/mirror_service.ts does instantiate mirrordaemon and uses it
  for /mirror/runtime\*, /mirror/health, and SSE event streaming.
- In practice, mirrordaemon is the canonical runtime state holder for the service
  process, but not for Mirror as a whole.
- Runtime sessions are created only by middleware in src/mirror-service/
  mirror_service.ts for paths starting with /mirror/chat and /mirror/tools.
- Console API paths such as /mirror/console/api/chat and /mirror/console/api/
  tools/:tool_name bypass that middleware, so they do not create or touch daemon
  sessions.
- CLI paths in src/mirror-cli/mirror_cli.ts and src/mirror-gateway/mirror_gateway.ts
  bypass daemon state entirely.
- Retrieval, provider, lore validation, review, sync, and workspace logic remain
  independently callable modules and do not depend on daemon state.
- The service publishes a few daemon events directly: sync.announce, sync.pull,
  runtime.health.requested.
- It does not publish daemon events for chat requests, tool executions, provider
  calls, review decisions, or console actions.
- Integration quality: transitional.
- It is clean enough to operate, but the daemon is still mostly an attached state/
  reporting layer, not the owner of request execution.

## 5. Remaining OpenClaw Coupling

Hard coupling:

- package.json: package name is openclaw, repo metadata is OpenClaw, both mirror and
  openclaw bins ship together. Risk: split pain remains high. Removal difficulty:
  medium-high.
- openclaw.mjs and src/entry.ts: OpenClaw CLI/bootstrap still live at repo root.
  Risk: packaging and release remain shared. Removal difficulty: high.
- src/mirror-entry.ts: explicitly advertises openclaw mirror ... compatibility.
  Risk: operator story remains dual-path. Removal difficulty: low-medium.
- src/mirror-runtime/mirror_chat_engine.ts: debug mode still keys off
  OPENCLAW_LOG_LEVEL. Risk: Mirror-owned runtime still reads OpenClaw env shape.
  Removal difficulty: low.
- src/mirror/passport/passport.ts: reads OPENCLAW\_\* env fallbacks. Risk: runtime
  identity remains cross-branded. Removal difficulty: low-medium.

Soft coupling:

- src/runtime/server.ts, src/runtime/brain-chat.ts, src/runtime/health.ts: retained
  legacy runtime surface. Risk: duplicate entrypoints and drift. Removal difficulty:
  low-medium.
- src/cli/mirror-cli.ts: OpenClaw-side compatibility diagnostics CLI. Risk: operator
  docs and maintenance split. Removal difficulty: low.
- src/mirror/lore_manifest/cli.ts: defaults to lore/manifest.json and lore/
  canonical, which do not match the newer MIRROR_LORE_DIR-driven runtime. Risk:
  stale operator behavior. Removal difficulty: low.
- .github/workflows/ci.yml: CI is full-repo OpenClaw CI, not a Mirror-native runtime
  lane. Risk: split-readiness is obscured. Removal difficulty: medium.

Naming/shape inheritance only:

- src/mirror-provider/mirror_provider.ts: still throws brain proxy error. Risk:
  cosmetic but misleading ownership. Removal difficulty: low.
- src/runtime/brain-chat.ts: provider is still conceptually named “brain”. Risk:
  naming drift. Removal difficulty: low.
- src/mirror/skills/discover.ts: archived builtins retained for compatibility/test
  references. Risk: confusion about canonical tool surface. Removal difficulty: low.

## 6. Compatibility-Only / Legacy Files

- src/runtime/server.ts: current role is legacy /health and /api/brain/chat. In-repo
  callers: none found. Status: wrapper-only, removable with modest work.
- src/runtime/brain-chat.ts: current role is legacy OpenAI-style chat proxy with
  replay protection. In-repo callers: src/runtime/server.ts and tests. Status:
  wrapper-only, removable with modest work if legacy API is dropped or replay
  protection is re-homed.
- src/cli/mirror-cli.ts: current role is compatibility-only openclaw mirror
  telemetry tail. In-repo callers: none found. Status: wrapper-only and likely near-
  dead.

Other likely shims / near-dead paths:

- src/runtime/health.ts: only meaningful with legacy runtime server.
- src/mirror/telemetry_tail/cli.ts: explicitly marked compatibility-only.
- src/mirror/skills/discover.ts: explicitly marked archived/compatibility-only.
- src/mirrordaemon/runtime_state.ts: buildStatusPayload() appears unused outside
  tests/search.

## 7. Standalone Operator Surface

- mirror status: weak. src/mirror/status/status.ts reports telemetry sink/index
  status, not daemon/service/runtime status.
- mirror verify-lore: partial. src/mirror/lore_manifest/cli.ts verifies a manifest,
  but its defaults still point at lore/canonical, not the MIRROR_LORE_DIR service
  reality.
- Console usability: partial. src/mirror-console/console_static.ts provides a real
  web console with chat, lore, task/reminder/monk, sync, ops, graph, but it is still
  raw HTML/JS and not session-aware.
- Service health/status: good. src/mirror-service/mirror_service.ts exposes /mirror/
  health, /mirror/status, /mirror/runtime, /mirror/runtime/debug.
- Session visibility: partial. /mirror/runtime/sessions is real, but only /mirror/
  chat and /mirror/tools/\* feed it, and sessions never close automatically.
- Runtime debugging: partial. /mirror/runtime/debug returns boot snapshot, sessions,
  diagnostics, and recent events, but events are sparse and global diagnostics are
  singleton-scoped.
- Sync visibility: partial. Sync endpoints and console surfaces exist, and metrics
  track peers/conflicts/updates, but sync state is not daemon-owned.
- Lore verification: partial. Schema validation exists in src/mirror/
  lore_validation/validator.ts, but the main CLI verification command is still the
  separate manifest checker.
- Operator ergonomics: partial. The mirror CLI is real and broad, but direct CLI
  execution and service execution do not share one canonical runtime plane.

## 8. Observability / Health / Debug Gaps

What exists:

- src/mirror-observability/metrics.ts: counters, gauges, latencies
- src/mirror-observability/diagnostics.ts: recent structured events
- src/mirror-observability/observability_server.ts: /mirror/metrics, /mirror/
  diagnostics
- src/mirrordaemon/runtime_state.ts: daemon debug snapshots
- src/mirror-service/mirror_service.ts: /mirror/health, /mirror/status, /mirror/
  runtime/events

What is missing:

- no daemon-local metrics store; observability is global module state
- no per-session traces or request correlation between daemon sessions and
  observability events
- no chat/tool/provider events on the daemon event stream
- no workspace-specific health/status endpoint
- no Monk-specific status/debug surface beyond generic tool counters
- no persisted metrics/events
- no operator-facing summary command that reflects service runtime truth
- no WebSocket surface; only SSE at /mirror/runtime/events
- no auth around runtime/debug/event endpoints

Top gaps before a clean split:

- daemon and observability are not unified
- service sessions do not cover console or CLI flows
- mirror status is not runtime status
- event inspection is shallow; no action/provider/tool lifecycle events
- health/debug surfaces are good enough for dev, not yet strong enough for
  standalone ops

## 9. Test / CI / Reliability State

Current test coverage is real for:

- mirrordaemon: src/mirrordaemon/mirrordaemon.test.ts
- service: src/mirror-service/mirror_service.test.ts
- CLI: src/mirror-cli/mirror_cli.test.ts
- console: src/mirror-console/mirror_console.test.ts
- observability: src/mirror-observability/observability.test.ts
- sync: src/mirror-sync/mirror_sync.test.ts
- retrieval/validation/review/skills/user workspace: multiple src/mirror/\*_/tests
  and src/mirror-user-workspace/_.test.ts

Under-tested areas:

- /mirror/runtime/events SSE behavior from the service
- daemon session coverage for console/API variants
- failure-path integration between daemon state and service routes
- removal safety for legacy wrappers
- runtime split boundary regressions

Reliability risks:

- daemon state is in-memory only
- observability is global singleton state, not daemon-scoped
- CLI and service can diverge because CLI bypasses daemon
- legacy and canonical entrypoints coexist
- verify-lore defaults are stale relative to current lore-root behavior

Top 5 highest-value test additions:

1. Service-level SSE test for /mirror/runtime/events covering runtime.started,
   session.created, sync.\*.
2. Session coverage test proving /mirror/console/api/chat and /mirror/console/api/
   tools/\* do or do not populate daemon sessions.
3. End-to-end mirror serve smoke hitting /mirror/health, /mirror/runtime, /mirror/
   tools, /mirror/chat.
4. Split-boundary regression test that Mirror-owned modules stop reading OPENCLAW\_\*
   envs except explicitly allowed compatibility files.
5. CLI/service parity tests for find, fact, commit, task, and sync.

Top 3 CI gates needed before standalone v1:

1. Dedicated Mirror runtime smoke lane for service + daemon + SSE + CLI.
2. Boundary lint gate preventing new OpenClaw-specific env/config references inside
   Mirror-owned runtime modules.
3. Dedicated Mirror-only focused test lane so runtime regressions are visible
   without depending on the full OpenClaw matrix.

## 10. Feature Readiness Against the Intended Roadmap

- WebSocket UI event surface - Current status: SSE only via /mirror/runtime/events in src/
  mirror-service/
  mirror_service.ts - Present pieces: daemon event stream, console, service
  routing - Blockers: no WS transport, sparse daemon events, no session
  correlation - Readiness: 2/5 - Belongs in Runtime now
- policy/law layer - Current status: basically absent - Present pieces: tool auth in src/mirror-gateway/auth.ts,
  review rules in src/
  mirror-review/review_rules.ts - Blockers: no policy engine, no law evaluation pipeline, no daemon-owned
  enforcement - Readiness: 1/5 - Belongs in Runtime now
- provider management plane
  - Current status: minimal
  - Present pieces: src/mirror-provider/mirror_provider.ts, src/mirror-service/
    config.ts
  - Blockers: single configured provider only, no provider registry, no provider
    health/rotation/status
  - Readiness: 1/5
  - Belongs in Runtime now
- general tool/action runtime
  - Current status: partial but real
  - Present pieces: src/mirror/skills/registry/index.ts, gateway tool routing, CLI
    tool surface, auth
  - Blockers: not daemon-owned, no generic action runtime, no per-action lifecycle
    or policy layer
  - Readiness: 3/5
  - Belongs in Runtime now
- wallet/onchain execution layer
  - Current status: mostly absent from canonical surface
  - Present pieces: archived chain builtins under src/mirror/skills/builtins
  - Blockers: not in canonical tool registry, no execution policy, no signing/
    wallet boundary
  - Readiness: 1/5
  - Should wait until Runtime has policy/provider/action management
- Mirror OS distribution environment
  - Current status: premature
  - Present pieces: standalone mirror bin, service, console, sync, workspace
  - Blockers: package/build/release are still OpenClaw-rooted, runtime not yet
    split-clean
  - Readiness: 1/5
  - Should wait for a later boundary, not now

## 11. Split Decision Checklist

### A. Reasons to NOT split yet

- package.json is still the OpenClaw package.
- Service runtime truth and CLI/operator truth are not unified.
- Daemon does not yet own execution; it mainly observes service traffic.
- Legacy wrappers still exist and some semantics live there.
- CI/build/release are still OpenClaw-first.

### B. Conditions that would justify a split

- daemon owns all canonical request execution state, not just service sessions
- CLI and service both route through one daemon-backed runtime plane
- legacy runtime wrappers are deleted or isolated
- Mirror-native package/build/release path exists
- runtime observability and status are daemon-native and stable

### C. Earliest sensible split boundary

- The earliest low-pain boundary is the cluster around:
  - src/mirrordaemon
  - src/mirror-service
  - src/mirror-runtime
  - src/mirror-provider
  - src/mirror-gateway
  - src/mirror-console
  - src/mirror-observability
  - src/mirror-sync
  - src/mirror-user-workspace
  - selected src/mirror submodules for lore/review/skills/status
- That boundary is not clean yet because the package, build, env, and compatibility
  story are still shared.

### D. Final recommendation

- Keep building features in current repo.
- Plain reason: the runtime itself is now real, but the repo boundary is not.
  Splitting now would mostly move unresolved coupling into a harder-to-maintain
  cross-repo dependency graph.

## 12. Next 10 Implementation Steps

1. P0, medium, make daemon own all service request ingress including /mirror/
   console/api/chat and /mirror/console/api/tools/\*. Why now: current session
   visibility is incomplete. Main files: mirror_service.ts, console_routes.ts.
2. P0, medium, publish chat/tool/provider/review events into mirrordaemon, not only
   observability. Why now: daemon event stream is too thin for UI/runtime use. Main
   files: mirrordaemon.ts, routes.ts, mirror_provider.ts, review_engine.ts.
3. P0, medium, add service-level SSE tests for /mirror/runtime/events. Why now:
   current event surface is unprotected by integration tests. Main files:
   mirror_service.test.ts.
4. P0, low, replace OPENCLAW_LOG_LEVEL and similar env fallbacks inside Mirror-owned
   runtime modules. Why now: reduces split drag immediately. Main files:
   mirror_chat_engine.ts, passport.ts.
5. P1, medium, make mirror status daemon/service-aware or add mirror runtime CLI
   commands for health/sessions/debug. Why now: standalone operator story is
   currently misleading. Main files: commands.ts, status.ts.
6. P1, low, align mirror verify-lore with MIRROR_LORE_DIR and current lore
   validation paths. Why now: current defaults are stale. Main files: cli.ts,
   commands.ts.
7. P1, medium, make observability daemon-scoped instead of process-global singleton
   state. Why now: required before serious multi-surface runtime use. Main files:
   metrics.ts, diagnostics.ts, runtime_state.ts.
8. P1, low, remove or quarantine unused compatibility wrappers if no external
   callers remain. Why now: reduces drift. Main files: server.ts, brain-chat.ts,
   mirror-cli.ts.
9. P2, medium, introduce a daemon-backed WebSocket event surface alongside SSE. Why
   now: it is the next real UI/runtime milestone after event richness exists. Main
   files: mirror_service.ts, mirrordaemon.
10. P2, high, create a Mirror-native package/build boundary while still inside this
    repo. Why now: this is the last step before a clean split, not the first. Main
    files: package.json, mirror.mjs, build scripts, CI workflows.

## 13. Repo Map Appendix

- src/mirrordaemon: boot snapshot, sessions, runtime summaries, event stream
- src/mirror-service: standalone Mirror HTTP service bootstrap
- src/mirror-gateway: Mirror API routing, tool auth, chat/tool handlers
- src/mirror-runtime: request normalization and prompt assembly
- src/mirror-provider: provider request/auth/response boundary
- src/mirror-console: lightweight web console UI and routes
- src/mirror-observability: metrics, diagnostics, structured logging, observability
  routes
- src/mirror-sync: peer sync, canon updates, graph sync
- src/mirror-user-workspace: user-scoped tasks, reminders, notes, profiles, sessions
- src/mirror: lore retrieval, validation, review, skills, status, telemetry,
  passport, privacy
- src/runtime: retained legacy compatibility runtime wrappers
- src/cli/mirror-cli.ts: retained OpenClaw-side compatibility CLI hook
- mirror.mjs: standalone Mirror binary bootstrap
- openclaw.mjs: OpenClaw binary bootstrap still shipped from the same package
