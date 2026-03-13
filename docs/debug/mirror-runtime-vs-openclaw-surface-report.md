# Mirror Runtime vs OpenClaw Surface Report

Last audited: March 13, 2026

## Executive Summary

Mirror Runtime is now the canonical runtime core in this repository.

That is true at three levels:

- runtime behavior
- operator-facing runtime surfaces
- root package identity

OpenClaw now remains in this repo mainly as:

- compatibility packaging
- legacy wrapper surfaces
- the large app/channel/user layer

The repo is no longer organized around one flat “OpenClaw core”.
It now has a clear split between:

- Mirror-native runtime core
- OpenClaw compatibility boundary
- OpenClaw app/channel/user layer

The next phase should not be “add random new features”.
The next phase should be a deliberate boundary phase:

1. formalize what remains outside Mirror Runtime
2. define adapter contracts for channels/app surfaces
3. add the next missing runtime layers that the detached core actually needs

## 1. Current Canonical Mirror Runtime Surface

These are the current canonical Mirror-native runtime subsystems:

### Runtime core

- [src/mirrordaemon](/home/tommy/mirror-runtime/src/mirrordaemon)
- [src/mirror-runtime](/home/tommy/mirror-runtime/src/mirror-runtime)
- [src/mirror-provider](/home/tommy/mirror-runtime/src/mirror-provider)
- [src/mirror-service](/home/tommy/mirror-runtime/src/mirror-service)
- [src/mirror-gateway](/home/tommy/mirror-runtime/src/mirror-gateway)

Responsibilities:

- runtime state ownership
- session registry
- event stream
- request normalization
- canon-first retrieval integration
- model/provider invocation
- standalone service boot
- canonical runtime APIs

### Operator/runtime surfaces

- [src/mirror-cli](/home/tommy/mirror-runtime/src/mirror-cli)
- [src/mirror-console](/home/tommy/mirror-runtime/src/mirror-console)
- [src/mirror-observability](/home/tommy/mirror-runtime/src/mirror-observability)
- [src/mirror-sync](/home/tommy/mirror-runtime/src/mirror-sync)
- [src/mirror-user-workspace](/home/tommy/mirror-runtime/src/mirror-user-workspace)

Responsibilities:

- native Mirror CLI
- native Mirror web console
- runtime metrics/diagnostics
- sync surface
- user workspace/task/reminder/session stores

### Canon/lore intelligence layer

- [src/mirror/lore_sources](/home/tommy/mirror-runtime/src/mirror/lore_sources)
- [src/mirror/lore_retrieval](/home/tommy/mirror-runtime/src/mirror/lore_retrieval)
- [src/mirror/lore_validation](/home/tommy/mirror-runtime/src/mirror/lore_validation)
- [src/mirror-review](/home/tommy/mirror-runtime/src/mirror-review)
- [src/mirror-reflection](/home/tommy/mirror-runtime/src/mirror-reflection)
- [src/mirror-lore-graph](/home/tommy/mirror-runtime/src/mirror-lore-graph)
- [src/mirror-memory](/home/tommy/mirror-runtime/src/mirror-memory)
- [src/mirror/skills](/home/tommy/mirror-runtime/src/mirror/skills)

Responsibilities:

- canon-first retrieval
- index freshness
- draft/canon validation
- review/conflict detection
- symbolic reflection
- lore graph construction/query
- secondary observation/reflection memory
- native authoring and retrieval skills

### Canonical package/runtime boundary

- [package.json](/home/tommy/mirror-runtime/package.json)
- [src/mirror-package.ts](/home/tommy/mirror-runtime/src/mirror-package.ts)
- [tsdown.mirror.config.ts](/home/tommy/mirror-runtime/tsdown.mirror.config.ts)
- [vitest.mirror.config.ts](/home/tommy/mirror-runtime/vitest.mirror.config.ts)
- [mirror-runtime-ci.yml](/home/tommy/mirror-runtime/.github/workflows/mirror-runtime-ci.yml)

This is the real detached Mirror core.

## 2. Remaining Compatibility-Only OpenClaw Surfaces

These are now compatibility-only, not canonical runtime surfaces:

### Explicit compatibility package

- [package.json](/home/tommy/mirror-runtime/packages/openclaw/package.json)

This exists to preserve:

- `openclaw`
- `openclaw/plugin-sdk`
- `openclaw/plugin-sdk/account-id`
- old entry expectations

### Compatibility code

- [src/compat/openclaw/runtime/server.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/server.ts)
- [src/compat/openclaw/runtime/brain-chat.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/brain-chat.ts)
- [src/compat/openclaw/runtime/health.ts](/home/tommy/mirror-runtime/src/compat/openclaw/runtime/health.ts)
- [src/compat/openclaw/cli/mirror-cli.ts](/home/tommy/mirror-runtime/src/compat/openclaw/cli/mirror-cli.ts)

### Thin shim paths still present

- [src/runtime](/home/tommy/mirror-runtime/src/runtime)
- [src/cli/mirror-cli.ts](/home/tommy/mirror-runtime/src/cli/mirror-cli.ts)

These should be treated as:

- compatibility shims
- wrapper-only paths
- non-canonical

## 3. Remaining OpenClaw App/User Layer

This is the large surface that is still not part of canonical Mirror Runtime.

### Channels and messaging integrations

Core channel surfaces still live outside Mirror Runtime:

- [src/telegram](/home/tommy/mirror-runtime/src/telegram)
- [src/web](/home/tommy/mirror-runtime/src/web)
  - WhatsApp/web-style runtime
- [src/discord](/home/tommy/mirror-runtime/src/discord)
- [src/slack](/home/tommy/mirror-runtime/src/slack)
- [src/imessage](/home/tommy/mirror-runtime/src/imessage)
- [src/signal](/home/tommy/mirror-runtime/src/signal)
- [src/channels](/home/tommy/mirror-runtime/src/channels)

Extension/plugin channel layer also remains outside Mirror Runtime:

- [extensions/telegram](/home/tommy/mirror-runtime/extensions/telegram)
- [extensions/whatsapp](/home/tommy/mirror-runtime/extensions/whatsapp)
- [extensions/discord](/home/tommy/mirror-runtime/extensions/discord)
- [extensions/slack](/home/tommy/mirror-runtime/extensions/slack)
- [extensions/imessage](/home/tommy/mirror-runtime/extensions/imessage)
- [extensions/signal](/home/tommy/mirror-runtime/extensions/signal)
- plus many other extension adapters under [extensions](/home/tommy/mirror-runtime/extensions)

### Gateway/app control layer

The large OpenClaw gateway/app control layer remains outside Mirror Runtime:

- [src/gateway](/home/tommy/mirror-runtime/src/gateway)
- [src/browser](/home/tommy/mirror-runtime/src/browser)
- [src/plugins](/home/tommy/mirror-runtime/src/plugins)
- [src/providers](/home/tommy/mirror-runtime/src/providers)

This area still owns:

- OpenClaw gateway HTTP/WS surfaces
- browser control plane
- plugin loading/runtime
- provider-specific auth/model handling
- various control UI and server methods

### CLI app/user workflows

The broad OpenClaw CLI/user workflow surface remains outside Mirror Runtime:

- [src/cli](/home/tommy/mirror-runtime/src/cli)
- [src/commands](/home/tommy/mirror-runtime/src/commands)
- [src/config](/home/tommy/mirror-runtime/src/config)
- [src/wizard](/home/tommy/mirror-runtime/src/wizard)

This area still owns:

- onboarding
- configuration editing
- provider auth flows
- channel setup
- doctor/update/install flows
- legacy daemon/gateway management
- generic OpenClaw command tree

### Web/app UI surfaces

The app/UI layer remains outside Mirror Runtime:

- [ui](/home/tommy/mirror-runtime/ui)
- [apps/android](/home/tommy/mirror-runtime/apps/android)
- [apps/ios](/home/tommy/mirror-runtime/apps/ios)
- [apps/macos](/home/tommy/mirror-runtime/apps/macos)
- [apps/shared](/home/tommy/mirror-runtime/apps/shared)

This is clearly app/operating-environment territory, not runtime-core territory.

## 4. What Mirror Runtime Provides Instead

Mirror Runtime now provides its own replacements for the old “OpenClaw core” assumptions.

### Daemon

- [src/mirrordaemon](/home/tommy/mirror-runtime/src/mirrordaemon)

Provides:

- boot snapshot
- sessions
- runtime state
- event stream
- debug/status summaries
- daemon-scoped observability

### Service

- [src/mirror-service](/home/tommy/mirror-runtime/src/mirror-service)

Provides:

- standalone Mirror service boot
- detached runtime HTTP surface
- lifecycle wiring
- runtime-host for local execution

### Gateway

- [src/mirror-gateway](/home/tommy/mirror-runtime/src/mirror-gateway)

Provides:

- Mirror-owned tool routing
- Mirror-owned chat route
- auth gate for write-capable tools

### Chat engine

- [src/mirror-runtime](/home/tommy/mirror-runtime/src/mirror-runtime)

Provides:

- normalized request shape
- retrieval/context assembly
- memory ordering
- reflection injection
- final model-facing message assembly

### Provider runtime

- [src/mirror-provider](/home/tommy/mirror-runtime/src/mirror-provider)

Provides:

- provider request shape
- auth/header construction
- provider invocation
- normalized provider response

### Lore/memory/review/graph

Mirror-native lore and memory stack:

- retrieval
- validation
- memory db
- reflection
- canon review
- lore graph
- skills

### CLI

- [src/mirror-cli](/home/tommy/mirror-runtime/src/mirror-cli)

Provides:

- native Mirror operator commands
- daemon-backed execution
- JSON/human output

### Console

- [src/mirror-console](/home/tommy/mirror-runtime/src/mirror-console)

Provides:

- native Mirror web console
- lore/tool/chat surfaces
- graph browsing

### Observability

- [src/mirror-observability](/home/tommy/mirror-runtime/src/mirror-observability)

Provides:

- metrics
- diagnostics
- tracing/log hooks
- runtime observability endpoints

### Sync

- [src/mirror-sync](/home/tommy/mirror-runtime/src/mirror-sync)

Provides:

- peer registration
- canon sync
- graph sync
- sync protocols/routes

## 5. Gap Analysis

### Intentionally outside Mirror Runtime

These should stay outside the canonical runtime core:

- Telegram/WhatsApp/Discord/Slack/iMessage/Signal transport implementations
- generalized OpenClaw gateway/browser control plane
- onboarding/config/update/install UX
- macOS/iOS/Android apps
- large plugin ecosystem and extension marketplace concerns

Reason:

These are transport, operator UX, app shell, or ecosystem layers.
They are not required to define the runtime engine itself.

### What should be pulled into Mirror Runtime next

These are runtime-core capabilities still missing or underdeveloped:

1. policy/law layer
2. provider management plane
3. generic action/tool runtime beyond the current skill wrappers
4. stronger daemon-owned action correlation and lifecycle summaries
5. channel adapter contract definitions for how non-runtime transports invoke Mirror

Reason:

These all deepen the runtime core without re-mixing app/channel concerns into it.

### What should remain adapters

These should be treated as adapters to Mirror Runtime, not migrated wholesale into it:

- Telegram integration
- WhatsApp/web integration
- Discord integration
- Slack integration
- iMessage integration
- Signal integration
- app UI shells
- onboarding/config/install flows

The right target is:

transport/app layer
→ adapter boundary
→ Mirror Runtime

not:

transport/app logic
→ merged back into runtime core

### What belongs later in Mirror OS

These are not immediate runtime-core priorities:

- OS distribution environment
- desktop/mobile distribution packaging
- multi-app environment orchestration
- broader user workspace shell
- platform-specific installer story

That is Mirror OS territory, not immediate runtime-core work.

## 6. Ranked Recommendation List for the Next Build Phase

### 1. Add a formal adapter contract for external surfaces

Priority: P0

Why:

The runtime is detached, but the transport/app layer still has no formal “call Mirror this way” contract.

Add:

- normalized adapter request shape
- normalized adapter response shape
- auth/session propagation rules
- event propagation expectations

Likely files:

- new `src/mirror-adapters/` or equivalent contract module
- docs under `docs/debug/`

### 2. Implement a policy/law layer

Priority: P0

Why:

The runtime now has enough power to retrieve, review, commit, and act.
It needs formal policy control before adding riskier capabilities.

Add:

- policy evaluation API
- action allow/deny model
- canon-write policy hooks
- future wallet/tool gating hooks

### 3. Implement a provider management plane

Priority: P1

Why:

Provider invocation exists, but provider management does not.
The detached runtime still assumes a single configured provider path.

Add:

- provider registry/state
- provider health
- provider selection/fallback
- provider diagnostics surface

### 4. Promote the current skill/tool runtime into a generalized action runtime

Priority: P1

Why:

Current skills are useful, but still thin wrappers.
The next phase should formalize action execution, lifecycle, and policy hooks.

Add:

- action registry
- action execution envelope
- action result/event model
- policy and observability hooks

### 5. Add a WebSocket event surface on top of mirrordaemon

Priority: P1

Why:

The daemon now has meaningful runtime truth.
SSE exists, but the next UI/runtime integration step is a proper WS event surface.

### 6. Keep channel/app surfaces as adapters, do not migrate them wholesale

Priority: P1

Why:

The clean move now is boundary definition, not channel ingestion into runtime core.

Practical rule:

- Telegram/WhatsApp/Discord/Slack/iMessage/Signal stay adapter-side
- Mirror Runtime receives normalized requests only

### 7. Decide whether to gradually route selected app surfaces through Mirror Gateway

Priority: P2

Why:

Once adapter contracts exist, selected app/user surfaces can be re-plumbed against Mirror Runtime without moving their whole codebases.

### 8. Defer Mirror OS work

Priority: P2

Why:

Runtime detachment is now strong enough for runtime feature work.
It is still too early to mix in OS/distribution/platform-environment work.

## Recommendation

The next build phase should be:

**Mirror Runtime consolidation and adapter-contract phase**

Not:

- channel migration phase
- app-shell migration phase
- Mirror OS phase

Plainly:

The runtime core is ready for deeper runtime features.
The app/channel layer should now be treated as external clients and adapters to that core.
