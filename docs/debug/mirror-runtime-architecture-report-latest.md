# Mirror Runtime Architecture Report (Latest)

## 1. Executive summary

Mirror Runtime now has a real Mirror-native application core:

- `src/mirror-service/` starts a dedicated Mirror HTTP service.
- `src/mirror-gateway/` exposes chat and tool routes.
- `src/mirror-runtime/` owns chat preparation, lore retrieval, reflection injection, and provider dispatch.
- `src/mirror/skills/` owns the native authoring and retrieval tools.
- `src/mirror-sync/` owns local-first peer discovery and canon/lore-graph synchronization.
- `src/mirror-review/`, `src/mirror-reflection/`, `src/mirror-lore-graph/`, `src/mirror-observability/`, and `src/mirror-console/` provide distinct Mirror-only subsystems.

Detachment progress is substantial at the runtime layer. The main chat path, canon retrieval path, canon authoring path, review path, lore graph path, and observability path are now Mirror-owned in code organization and behavior.

Mirror Runtime is now close to a clean standalone product. It has a standalone `mirror` binary, a canonical `/mirror/*` HTTP surface, and a unified service + console surface. It is still not fully detached as a repository/package identity. The remaining blockers are:

- package identity is still `openclaw`
- there are still OpenClaw compatibility entrypoints under `src/runtime/*`
- the OpenClaw CLI integration for `mirror` is now explicitly compatibility-only
- a few core utilities still depend on shared OpenClaw modules rather than Mirror-local copies

Bottom line:

- Runtime core: mostly detached
- Product surface: mostly detached
- Claim status: "standalone-capable, not fully detached"

## 2. Full architecture map

### Mirror CLI

Two different CLI surfaces exist right now.

Standalone Mirror app CLI in `src/mirror-cli/`:

- `chat`
- `find`
- `fact`
- `interpret`
- `forge`
- `commit`
- `serve`

This is now the primary standalone Mirror CLI surface and ships through the `mirror` binary.

OpenClaw-integrated Mirror CLI in `src/cli/mirror-cli.ts` plus `src/mirror/telemetry_tail/cli.ts`:

- `openclaw mirror doctor`
- `openclaw mirror status`
- `openclaw mirror passport`
- `openclaw mirror verify-lore`
- `openclaw mirror telemetry tail|replay|index|query|reflect`

This is now explicitly an OpenClaw compatibility/admin surface.

### Mirror Service

`src/mirror-service/`

Responsibilities:

- load Mirror config from `MIRROR_*` env
- initialize lifecycle state
- initialize Mirror memory DB
- discover lore files and ensure scroll index freshness
- mount Mirror gateway router
- mount Mirror observability router

This is the clearest current standalone service entrypoint.

### Mirror Gateway

`src/mirror-gateway/`

Responsibilities:

- expose chat route
- expose native Mirror tool routes
- validate tool input schemas
- enforce operator auth for write tools
- build the native tool registry

Current role:

- thin HTTP orchestration layer over the Mirror runtime and Mirror skill registry

### Mirror Chat Engine

`src/mirror-runtime/mirror_chat_engine.ts`

Responsibilities:

- validate incoming chat request
- run canon retrieval against latest user turn
- build lore context
- build reflection prompt
- prepend canon/reflection system messages
- dispatch prepared request to provider or caller

This is the core request-preparation pipeline.

### Mirror Reflection Engine

`src/mirror-reflection/`

Responsibilities:

- analyze canon context
- compute symbol resonance
- enrich context with lore-graph concept clusters
- review drafts against canon overlap and symbolic mismatch

This sits between retrieval and generation for answer quality, and between draft authoring and commit for canon quality.

### Mirror Retrieval / Context Builder / Memory

Retrieval:

- `src/mirror/lore_retrieval/service.ts`
- `src/mirror/lore_retrieval/context_builder.ts`
- `src/mirror/lore_retrieval/symbol_registry.ts`

Memory:

- `src/mirror-memory/`

Lore source/indexing:

- `src/mirror/lore_sources/`

Responsibilities:

- resolve lore root
- discover canonical lore files
- maintain `_index/scroll_index.json`
- load helper indexes like `KEYWORD_INDEX.json`, `SUPERSEDES.json`, `FACT_UPDATES.md`
- rank canon candidates
- append secondary memory only after canon

Important boundary:

- canon scrolls are primary
- observations/reflections/history are explicitly secondary

### Mirror Provider Runtime

`src/mirror-provider/`

Responsibilities:

- build provider request headers
- POST prepared model requests to configured provider URL
- handle auth token transport
- capture provider latency/logging

This layer is intentionally thin and generic.

### Mirror Skills / Tool Registry

`src/mirror/skills/`

Two sub-layers exist:

Native runtime tools exposed through the gateway:

- `mirror.find-scroll`
- `mirror.canon-fact`
- `mirror.forge-scroll`
- `mirror.commit-scroll`
- `mirror.interpret-tweet`

Built-in skill engine/discovery layer:

- `mirror.echo`
- `mirror.find_scroll`
- `mirror.chain.token_state`
- `mirror.chain.token_balance`
- `mirror.chain.wallet_profile`

Observation:

- the gateway tool registry is clearly Mirror-native
- the built-in skill discovery layer is broader than the currently exposed gateway tool surface

### Lore Graph

`src/mirror-lore-graph/`

Responsibilities:

- build graph nodes for scrolls, symbols, concepts
- infer reference edges
- infer shared-symbol edges
- infer supersession edges
- infer narrative-similarity edges
- answer graph queries for related scrolls, clusters, and chains

### Review Engine

`src/mirror-review/`

Responsibilities:

- retrieve canon candidates for a draft
- detect narrative similarity
- detect canon conflicts
- validate symbols
- derive review status: `approved`, `needs_review`, `conflict_detected`

This is the write-path gatekeeper before canon commit.

### Observability

`src/mirror-observability/`

Responsibilities:

- counters
- latency summaries
- per-tool execution counts
- recent diagnostics/event log
- service endpoints for metrics and diagnostics

Current metrics cover:

- chat requests
- tool executions
- retrieval time
- provider latency
- review conflicts
- graph query frequency
- peers known
- updates pulled
- sync failures
- conflict warnings

### Mirror Node Sync

`src/mirror-sync/`

Responsibilities:

- maintain a local peer registry for known Mirror nodes
- expose local canon update metadata
- fetch remote canon update metadata
- validate and pull newer remote canon files under explicit rules
- expose lore graph freshness/version metadata
- trigger local graph rebuild after remote sync when needed

Design boundary:

- consumes existing canon files, index files, and lore graph outputs
- does not change retrieval internals
- does not change commit/review rules
- does not implement distributed consensus

### Web Console

`src/mirror-console/`

Responsibilities:

- serve Mirror console HTML
- proxy chat/tool handlers from gateway
- expose lore graph browser endpoints

Important current limitation:

- the canonical shipped surface is the main Mirror service under `/mirror/console`
- the old console-specific bootstrap wrapper has been retired

## 3. Runtime execution flow

Current end-to-end chat path:

1. Client sends chat request to `POST /mirror/chat` on the Mirror gateway/service.
2. Gateway validates that a provider is configured.
3. Gateway increments `chat_requests` and logs `chat.pipeline`.
4. Gateway calls `executeMirrorChatWithProvider(...)`.
5. `prepareMirrorChatRequest(...)` validates the request and finds the latest user message.
6. `retrieveCanonicalScrolls(...)` loads lore indexes and memory context, ranks canonical candidates, and returns diagnostics.
7. Retrieval latency is recorded as `retrieval_time_ms`.
8. `buildLoreContext(...)` composes canon excerpts first, then optional secondary memory context.
9. `reflectOnCanonContext(...)` computes themes, symbol resonance, conflicts, and lore-graph concept clusters.
10. The chat engine prepends two system messages:
    - canon context
    - reflection prompt
11. `executeMirrorProviderRequest(...)` sends the prepared request to the configured provider URL.
12. Provider latency is recorded as `provider_latency_ms`.
13. Response returns to gateway, then back to caller.

This is now a Mirror-native pipeline from request shaping through provider dispatch.

## 4. Canon-authoring flow

Current authoring flow:

### Interpret

`mirror.interpret-tweet`

- accepts raw source text
- infers family (`L`, `QA`, `C`)
- extracts marks/symbol hints
- retrieves related canon
- proposes title, symbols, topics, anchors, and a forge payload

### Forge

`mirror.forge-scroll`

- creates a draft filename template
- builds frontmatter
- builds category-specific markdown body scaffold
- suggests symbols from the registry
- validates the generated draft in isolation

### Review

`mirror-review/reviewDraftForCanon(...)`

- retrieves related canon candidates
- measures narrative similarity
- detects conflicts
- validates symbol usage
- returns `approved`, `needs_review`, or `conflict_detected`

### Commit

`mirror.commit-scroll`

- infers or accepts target family
- assigns the next family number
- rewrites placeholder IDs
- validates draft in corpus context
- runs review engine
- refuses conflicting writes unless `force`
- atomically writes the new scroll
- refreshes the scroll index

Canonical path summary:

- interpret -> forge -> review -> commit

This flow is now present in Mirror-native modules end to end.

## 5. Current interfaces

### CLI commands

Standalone Mirror CLI in `src/mirror-cli/`:

- `mirror chat <text>`
- `mirror find <text>`
- `mirror fact <text>`
- `mirror interpret <text>`
- `mirror forge --title <title> --family <L|QA|C> <narrative>`
- `mirror commit [--filename ...] [--family ...] [--dry-run] [--force] <draft>`
- `mirror serve [--port <n>]`

Current OpenClaw-integrated Mirror CLI:

- `openclaw mirror doctor`
- `openclaw mirror status`
- `openclaw mirror passport`
- `openclaw mirror verify-lore`
- `openclaw mirror telemetry tail`
- `openclaw mirror telemetry replay`
- `openclaw mirror telemetry index`
- `openclaw mirror telemetry query`
- `openclaw mirror telemetry reflect`

### Service endpoints

Mounted by `startMirrorService(...)`:

- `GET /mirror/tools`
- `POST /mirror/chat`
- `POST /mirror/tools/:tool_name`
- `GET /mirror/metrics`
- `GET /mirror/diagnostics`
- `POST /mirror-sync/announce`
- `GET /mirror-sync/updates`
- `POST /mirror-sync/pull`
- `GET /mirror-sync/peers`

### Gateway/tool endpoints

Primary current routes:

- `POST /mirror/chat`
- `GET /mirror/tools`
- `POST /mirror/tools/mirror.find-scroll`
- `POST /mirror/tools/mirror.canon-fact`
- `POST /mirror/tools/mirror.interpret-tweet`
- `POST /mirror/tools/mirror.forge-scroll`
- `POST /mirror/tools/mirror.commit-scroll`

Compatibility aliases still exist under `src/runtime/` when the legacy runtime server is used:

- `GET /mirror/tools`
- `POST /mirror/tools/:tool_name`
- `POST /api/brain/chat`
- `GET /health`

### Console routes

Canonical console surface on the main service:

- `GET /mirror/console`
- `GET /mirror/console/api/tools`
- `POST /mirror/console/api/chat`
- `POST /mirror/console/api/tools/:tool_name`
- `GET /mirror/console/api/graph/related`
- `GET /mirror/console/api/graph/symbols`
- `GET /mirror/console/api/graph/supersession`
- `GET /mirror/console/api/graph/clusters`

### Observability endpoints

- `GET /mirror/metrics`
- `GET /mirror/diagnostics`

## 6. Ownership analysis

| Module                                                   | Status                   | Notes                                                                                                                     |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/mirror-service/`                                    | MIRROR-OWNED             | Dedicated Mirror service bootstrap, config, lifecycle, and route mounting.                                                |
| `src/mirror-gateway/`                                    | MIRROR-OWNED             | Native Mirror router, tool auth, tool validation, chat/tool orchestration.                                                |
| `src/mirror-runtime/`                                    | MIRROR-OWNED             | Core chat prep/runtime execution path is Mirror-native.                                                                   |
| `src/mirror-reflection/`                                 | MIRROR-OWNED             | Reflection and draft review are Mirror-specific.                                                                          |
| `src/mirror-review/`                                     | MIRROR-OWNED             | Canon review engine is Mirror-specific.                                                                                   |
| `src/mirror/lore_retrieval/`                             | MIRROR-OWNED             | Canon-first retrieval and context building are Mirror-native.                                                             |
| `src/mirror/lore_sources/`                               | MIRROR-OWNED             | Lore root policy, discovery, and index maintenance are Mirror-native.                                                     |
| `src/mirror-memory/`                                     | FUTURE DETACHMENT TARGET | Functional and mostly Mirror-specific, but DB bootstrap still depends on shared OpenClaw sqlite helper.                   |
| `src/mirror-provider/`                                   | MIRROR-OWNED             | Thin provider adapter, independent in behavior.                                                                           |
| `src/mirror/skills/` native tool layer                   | MIRROR-OWNED             | Retrieval and authoring tools are Mirror-native.                                                                          |
| `src/mirror/skills/` built-in discovery layer            | FUTURE DETACHMENT TARGET | Native to Mirror, but not yet fully aligned with the runtime-exposed tool surface.                                        |
| `src/mirror-lore-graph/`                                 | MIRROR-OWNED             | Native graph construction and graph queries.                                                                              |
| `src/mirror-observability/`                              | MIRROR-OWNED             | New metrics/diagnostics layer is Mirror-native.                                                                           |
| `src/mirror-sync/`                                       | MIRROR-OWNED             | Local-first sync layer for peers, canon metadata exchange, safe pulls, and graph freshness metadata.                      |
| `src/mirror-console/`                                    | MIRROR-OWNED             | Native UI/server layer, now mounted on the main Mirror service under `/mirror/console`.                                   |
| `src/runtime/server.ts`                                  | COMPATIBILITY WRAPPER    | Legacy runtime wrapper still exposes Mirror chat/tools under older server assumptions.                                    |
| `src/runtime/brain-chat.ts`                              | COMPATIBILITY WRAPPER    | Legacy OpenAI-style `/api/brain/chat` proxy over the new Mirror runtime path.                                             |
| `src/cli/mirror-cli.ts`                                  | STILL OPENCLAW-DEPENDENT | Registers `openclaw mirror ...` diagnostics commands in the OpenClaw CLI.                                                 |
| `src/mirror/telemetry_tail/cli.ts`                       | STILL OPENCLAW-DEPENDENT | Active command surface still framed as `openclaw mirror ...`.                                                             |
| `package.json` / repo metadata                           | STILL OPENCLAW-DEPENDENT | Package name, homepage, bugs, repo URL, and shipped bin are all OpenClaw.                                                 |
| `docs/mirror/MIRROR_OPERATOR_GUIDE.md`                   | STILL OPENCLAW-DEPENDENT | Describes Mirror as an OpenClaw diagnostics layer, not as its own runtime product.                                        |
| `docs/lore/SYMBOL_REGISTRY.md` runtime dependency        | FUTURE DETACHMENT TARGET | Used as runtime data by Mirror retrieval/validation, but lives in docs rather than a Mirror-owned runtime asset location. |
| `src/memory/sqlite.ts` dependency from Mirror DB modules | STILL OPENCLAW-DEPENDENT | Shared helper imported by `src/mirror-memory/db.ts` and `src/mirror/telemetry_index/db.ts`.                               |

## 7. Remaining detachment blockers

The current blockers for a clean "fully detached" claim are specific and limited.

### 1. Package and binary identity are still OpenClaw

Current state:

- package name is `openclaw`
- standalone `mirror` bin now exists, but the package identity is still OpenClaw
- package metadata points to `openclaw/openclaw`

Impact:

- Mirror Runtime is not independently installable or shippable yet
- users still enter through OpenClaw identity even when using Mirror functionality

### 2. The standalone Mirror CLI is not the shipped CLI

Current state:

- `src/mirror-cli/` implements the new application CLI
- `src/mirror-entry.ts` and `mirror.mjs` now ship it as the `mirror` binary
- OpenClaw still exposes `openclaw mirror ...` as a compatibility diagnostics/admin surface

Impact:

- the primary operator surface is now correct
- compatibility and package-level branding still lag

### 3. Compatibility runtime wrappers still exist and duplicate route surfaces

Current state:

- `src/runtime/server.ts`
- `src/runtime/brain-chat.ts`

Impact:

- multiple route shapes exist for similar functionality
- legacy names like `/api/brain/chat` and `/mirror/tools` remain in circulation
- architecture boundaries are harder to state cleanly

### 4. Shared OpenClaw helper dependency still exists in Mirror-adjacent code

Current state:

- direct DB bootstrap imports were moved behind `src/mirror/shared/sqlite.ts`
- this removes direct imports from OpenClaw's shared memory helper
- other broader repo/package-level infrastructure is still shared

Impact:

- Mirror storage bootstrap is not fully self-owned
- extracting the Mirror runtime into its own package would still require carrying shared OpenClaw internals

### 5. Runtime data still depends on docs layout

Current state:

- symbol registry is loaded from `docs/lore/SYMBOL_REGISTRY.md`

Impact:

- a runtime-critical dependency is coupled to the docs tree and docs formatting
- this is fragile for packaging and for any future repo split

### 6. Mirror Console compatibility wrapper retirement

Current state:

- the canonical console is mounted on the main Mirror service
- the console-specific bootstrap wrapper has been removed

Impact:

- the shipped surface is now coherent
- console startup no longer has a duplicate compatibility path

## 7a. Intentional compatibility-only surfaces

The following pieces now remain intentionally compatibility-only:

- `openclaw mirror ...` telemetry/doctor/passport commands
- `src/runtime/server.ts` compatibility runtime server
- `src/runtime/brain-chat.ts` OpenAI-style `/api/brain/chat` bridge

These should not be treated as the primary product surface. The primary operator path is now:

- `mirror ...`
- `startMirrorService(...)`
- `/mirror/*`

## 8. Stability and risk analysis

### Duplicated logic

Current duplication/debt:

- `src/mirror-service/` and `src/runtime/server.ts` both expose Mirror HTTP behavior
- `mirror` and OpenClaw's `openclaw mirror ...` compatibility CLI are different surfaces
- gateway path shapes are inconsistent:
  - chat is `/mirror/chat`
  - tools are under `/mirror/tools/*`
  - compatibility aliases still add `/api/brain/chat` and compatibility wrapper modules

Risk:

- documentation drift
- user confusion
- test coverage fragmented across multiple public surfaces

### Compatibility debt

Mirror naming currently spans:

- `src/mirror-*`
- `src/mirror/**`
- `src/runtime/*`
- `src/cli/mirror-cli.ts`
- `package.json` / OpenClaw package identity

Risk:

- detachment work slows down because the mental model is still split

### Auth gaps

Current state:

- operator auth protects write tools through `MIRROR_OPERATOR_TOKEN`
- chat route is open if the service is reachable
- observability routes are open if the service is reachable
- graph console routes are open if the console server is reachable

Risk:

- service deployment currently assumes trusted network placement
- there is no broader service-level auth boundary around read surfaces

### Write-path risks

Current state:

- `mirror.commit-scroll` writes directly to the lore tree
- review conflicts can be bypassed with `force`
- no VCS workflow, approval queue, or file lock exists around lore writes
- index refresh happens in-process after write

Risk:

- concurrent writers can still race
- direct filesystem writes make audit/revert harder than a queued or PR-based flow
- review policy is present, but governance remains light

### Maintainability concerns

High-friction areas:

- runtime-critical symbol registry parsing from docs markdown
- service does not yet mount console
- console HTML route targets are inconsistent with console router paths
- built-in skill discovery and runtime-exposed tool registry are only partially aligned

Net risk assessment:

- read path: moderate and getting better
- write path: moderate to high
- packaging/identity: high for detachment work

## 9. Utility opportunity map

After detachment, the best next user-facing work should use the current strengths:

- canon-first retrieval
- guided authoring flow
- lore graph
- reflection/review
- local memory

Top 5 practical utility modules:

### 1. Personal knowledge inbox

Rank: #1

What it does:

- ingest raw notes, tweets, links, chat fragments, and observations
- classify them as observation, canon candidate, or discard
- queue them for interpret/forge/review

Why it matters:

- this turns Mirror from a lore responder into a daily capture tool
- it directly feeds the existing authoring pipeline

### 2. Daily brief and continuity report

Rank: #2

What it does:

- summarize recent canon changes, observations, pending review items, and related lore clusters
- produce a daily "what changed / what needs action" brief

Why it matters:

- practical daily utility for operators and writers
- makes observability and memory useful to humans, not just infrastructure

### 3. Source-to-scroll workflow

Rank: #3

What it does:

- take a raw source bundle such as tweet thread, note dump, or transcript
- produce:
  - interpretation
  - proposed draft
  - review notes
  - final commit preview

Why it matters:

- this is the most natural productization of the current interpret -> forge -> review stack

### 4. Citation-first answer mode

Rank: #4

What it does:

- answer questions with explicit cited canon excerpts and scroll anchors
- optionally include related graph neighbors and supersession context

Why it matters:

- strong day-to-day utility
- improves trust and makes the current retrieval system more obviously useful

### 5. Review inbox / canon change queue

Rank: #5

What it does:

- show drafts awaiting review
- surface conflict reasons, symbol issues, overlap warnings, and diff previews
- allow approve/reject/force with operator auth

Why it matters:

- reduces write-path risk
- turns existing review logic into an operator-grade workflow

## 10. Recommended next step

The single best next action is final detachment cleanup, not first utility expansion.

Why:

- the core runtime is already useful enough to support utility work
- but the remaining confusion is structural, not feature-related
- adding more utility features before cleanup would deepen the split between:
  - Mirror-native runtime code
  - OpenClaw package identity
  - compatibility wrappers
  - duplicate CLI and HTTP surfaces

Recommended cleanup scope:

1. Make the standalone Mirror CLI the canonical CLI surface.
2. Give Mirror its own package/bin identity.
3. Collapse route aliases to one canonical HTTP surface.
4. Retire or isolate `src/runtime/*` compatibility wrappers.
5. Move runtime-critical data like symbol registry out of docs-only locations.
6. Replace shared OpenClaw sqlite helper usage with Mirror-local storage helpers.
7. Mount or fix the web console as a first-class surface.

Reason to do this before utility expansion:

- after this cleanup, every new user-facing feature lands on the final product surface instead of on transitional scaffolding
- that keeps the next wave of utility work from inheriting OpenClaw-era compatibility debt
