• Yes. The cleanest way is a strict ordered checklist. Paste one item at a time, and
I’ll implement that item before moving to the next.

1. Make console API requests daemon-backed.
   Goal: /mirror/console/api/chat and /mirror/console/api/tools/_ must create/touch
   daemon sessions exactly like /mirror/chat and /mirror/tools/_.
2. Make CLI execution daemon-backed.
   Goal: mirror chat, mirror find, mirror fact, mirror interpret, mirror forge,
   mirror commit, mirror sync, mirror task, mirror reminder, mirror heartbeat, and
   mirror monk must execute through a daemon-backed runtime path, not direct gateway-
   only execution.
3. Expand daemon runtime events.
   Goal: emit daemon events for chat start/finish/failure, tool execution/result/
   failure, provider call start/finish/failure, review decision, and sync lifecycle.
4. Move observability under daemon/runtime ownership.
   Goal: metrics and diagnostics must become daemon-scoped or runtime-context-scoped
   instead of process-global singletons.
5. Add service-level runtime event tests.
   Goal: test /mirror/runtime/events end to end, including live event emission from
   real request flows.
6. Remove OpenClaw env usage from canonical Mirror modules.
   Goal: replace OPENCLAW*\* reads in Mirror-owned runtime code with MIRROR*\*, leaving
   any compatibility fallbacks only in quarantined compat files.
7. Fix operator truth for mirror status.
   Goal: mirror status must report actual runtime/service/daemon truth instead of
   telemetry-file status.
8. Fix operator truth for mirror verify-lore.
   Goal: verify-lore must align with MIRROR_LORE_DIR and the real current lore
   layout.
9. Quarantine legacy compatibility runtime wrappers.
   Goal: isolate or retire:
   src/runtime/server.ts
   src/runtime/brain-chat.ts
   src/runtime/health.ts
   src/cli/mirror-cli.ts
10. Create a Mirror-native package/build boundary inside this repo.
    Goal: make Mirror a first-class build/test target without depending on OpenClaw as
    the primary package identity.
11. Add a dedicated Mirror runtime CI lane.
    Goal: build, boot, and smoke-test the standalone Mirror runtime path independently
    from broad OpenClaw CI.
12. Final detachment pass.
    Goal: verify one canonical runtime truth across CLI, service, console, daemon,
    observability, and operator status surfaces.

If you want, start by pasting exactly this:

Item 1: Make console API requests daemon-backed.
