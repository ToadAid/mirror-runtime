# Mirror Runtime System Report

Date: 2026-03-12

## System Overview

Mirror Runtime in this workspace is a mixed state system with three distinct layers:

- OpenClaw runtime and channel infrastructure
- Mirror runtime, telemetry, lore, and helper modules
- Tobyworld lore corpus and helper indexes under `lore-scrolls/`

High-level architecture visible in the repo today:

1. Channel ingress enters through OpenClaw channel/runtime code.
2. Runtime proxy logic exists in `src/runtime/`.
3. Mirror-specific supporting systems live mostly under `src/mirror/`.
4. Lore corpus currently lives in the workspace at `lore-scrolls/`.
5. Lore helper indexes live under `lore-scrolls/_index/`.
6. Memory DB scaffold lives under `src/mirror-memory/`.

Observed Telegram -> OpenClaw -> MirrorDaemon -> provider path reality:

- Telegram/OpenClaw channel infrastructure exists in `src/telegram/`, `src/channels/telegram/`, and broader gateway/runtime code.
- A concrete runtime proxy path exists in `src/runtime/server.ts` and `src/runtime/brain-chat.ts`.
- That runtime exposes `/health` and `/api/brain/chat`.
- The codebase documents a Node Runtime -> Python Brain split, but there is no repo-local module literally named `MirrorDaemon`.
- The nearest implemented path is OpenClaw/runtime -> `src/runtime/server.ts` -> `src/runtime/brain-chat.ts` -> configured brain/provider endpoint.

Lore retrieval components currently present:

- `src/mirror/lore_sources/`
  - canonical/local lore discovery
  - auto-maintained `scroll_index.json` freshness check
- `src/mirror/lore_manifest/`
  - manifest verification and signature checks
- `src/mirror/lore_embeddings/`
  - canonical-vs-local filtering for embedding sources
- `lore-scrolls/_index/`
  - human and machine helper indexes

Memory DB components currently present:

- `src/mirror-memory/`
  - SQLite scaffold for observations, canon updates, user reflections, retrieval history
- `src/mirror/memory_ledger/`
  - separate existing memory/mistake ledger subsystem
- `docs/debug/mirror-memory-scaffold.md`
  - scaffold explanation and boundaries

Helper index components currently present:

- `lore-scrolls/_index/FACT_UPDATES.md`
- `lore-scrolls/_index/KEYWORD_INDEX.json`
- `lore-scrolls/_index/SUPERSEDES.json`
- `lore-scrolls/_index/build_scroll_index.py`
- `lore-scrolls/_index/scroll_index.json`
- `src/mirror/lore_sources/scroll_index.ts`
  - TypeScript auto-build / auto-rebuild helper used during lore discovery

## Completed Milestones

This section reflects the current repository state, not roadmap intent.

### Mirror Direct Provider Path v1

Status: WORKING

Evidence:

- `src/runtime/server.ts`
- `src/runtime/brain-chat.ts`
- `src/runtime/health.ts`
- `docs/MIRROR_RUNTIME_V1_SPEC.md`

Current interpretation:

- A direct runtime proxy path exists from runtime server to configured brain/provider endpoint.
- The exact milestone label "Mirror Direct Provider Path v1" is not present verbatim, but the underlying path is implemented.

### daemon-boundary integration harness

Status: WORKING

Evidence:

- `docs/MIRROR_BOUNDARY.md`
- `src/mirror/cadence_guard/`
- telemetry and doctor/status surfaces under `src/mirror/`

Current interpretation:

- Boundary overlay and operator inspection surfaces exist.
- This is better described as a boundary/telemetry harness than a fully named "daemon-boundary integration harness" artifact.

### direct operator path

Status: WORKING

Evidence:

- `docs/mirror/MIRROR_OPERATOR_GUIDE.md`
- `openclaw mirror doctor`
- `openclaw mirror status`
- telemetry index/query/tail/reflect commands documented in the guide

Current interpretation:

- Operator-facing CLI path exists and is documented.
- It is oriented to diagnostics and telemetry rather than lore answering.

### lore index helper

Status: WORKING

Evidence:

- `lore-scrolls/_index/*`
- `src/mirror/lore_sources/scroll_index.ts`
- `src/mirror/lore_sources/tests/scroll_index.test.ts`

Current interpretation:

- Helper files exist.
- `scroll_index.json` now auto-builds or auto-rebuilds when canonical lore discovery runs and the index is missing or stale.
- Retrieval does not yet consume the helper index directly.

### memory DB scaffold

Status: SCAFFOLDED

Evidence:

- `src/mirror-memory/db.ts`
- `src/mirror-memory/repository.ts`
- `src/mirror-memory/schema.sql`
- `src/mirror-memory/init.test.ts`

Current interpretation:

- SQLite scaffold exists and tests pass.
- It is not wired into answer generation, retrieval ranking, or lore conflict handling.

### symbol registry / schema docs

Status: WORKING

Evidence:

- `docs/lore/SYMBOL_REGISTRY.md`
- `docs/lore/SCROLL_SCHEMA.md`

Current interpretation:

- Documentation exists and was expanded to cover families, metadata, parser guidance, symbolic rules, and anti-drift guidance.
- These docs are not yet enforced by parser or validation code.

### Agent0 lore file creation proof

Status: WORKING, WITH CAVEAT

Evidence in the copied lore corpus:

- `lore-scrolls/TOBY_A001_TheFirstInscription_2025-09-09_EN.md`
- `lore-scrolls/TOBY_A002_TheQuietPond_2025-09-09_EN.md`
- `lore-scrolls/MIRROR_A001_TheFirstWord_2025-09-09_EN.md`
- `lore-scrolls/MIRROR_A002_TheFirstQuestion_2025-09-09_EN.md`

Current interpretation:

- There is concrete proof in the corpus that A-family files exist.
- This repo does not contain a clearly documented provenance trail tying those files to a specific "Agent0 lore file creation proof" implementation, so the milestone is evidenced by artifacts rather than by a named pipeline.

## Current Modules By Area

### Runtime / daemon

Key modules:

- `src/runtime/server.ts`
- `src/runtime/brain-chat.ts`
- `src/runtime/health.ts`
- `src/daemon/*`
- `src/mirror/status/*`
- `src/mirror/doctor/*`

Status: WORKING

Notes:

- Runtime server and daemon/service infrastructure exist.
- Mirror-specific operational surfaces are mostly diagnostics-oriented.

### Provider execution

Key modules:

- `src/runtime/brain-chat.ts`
- `src/providers/*`
- broader OpenClaw runtime/config wiring

Status: WORKING

Notes:

- Direct provider/brain proxy path exists.
- Mirror-specific provider selection and lore-aware dispatch are not visible as a separate module.

### Lore retrieval

Key modules:

- `src/mirror/lore_sources/*`
- `src/mirror/lore_manifest/*`
- `src/mirror/lore_embeddings/*`
- `docs/RAG_MODULE_SPEC.md`

Status: WORKING

Notes:

- Discovery, manifest verification, and embedding-source policy exist.
- Full answer-time retrieval integration against helper indexes and memory DB is not yet visible as a complete end-to-end answering path.

### Lore indexing

Key modules:

- `lore-scrolls/_index/*`
- `src/mirror/lore_sources/scroll_index.ts`

Status: WORKING

Notes:

- Manual Python index builder exists.
- Safe TypeScript auto-build/rebuild now exists during canonical lore discovery.

### Memory database

Key modules:

- `src/mirror-memory/*`
- existing `src/mirror/memory_ledger/*`

Status: SCAFFOLDED

Notes:

- The new memory DB scaffold exists.
- The older ledger subsystem exists too.
- There is currently a two-track memory story that needs consolidation or clear boundary definitions.

### Docs / schema

Key modules:

- `docs/lore/SYMBOL_REGISTRY.md`
- `docs/lore/SCROLL_SCHEMA.md`
- `docs/MIRROR_RUNTIME_V1_SPEC.md`
- `docs/MIRROR_BOUNDARY.md`
- `docs/RAG_MODULE_SPEC.md`
- `docs/mirror/MIRROR_OPERATOR_GUIDE.md`

Status: WORKING

Notes:

- Core documentation exists.
- Some higher-level docs are still draft-like or reflect roadmap state rather than current wiring reality.

### Scripts / operator tooling

Key modules:

- `openclaw mirror doctor`
- `openclaw mirror status`
- `openclaw mirror telemetry *`
- `lore-scrolls/_index/build_scroll_index.py`

Status: WORKING

Notes:

- Diagnostics/operator tooling exists.
- Lore helper tooling is partially split between repo-local script and TypeScript runtime helper.

## Status Classification Summary

| Area                                       | Status        | Reason                                                                                                     |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Runtime / daemon                           | WORKING       | Runtime proxy and daemon/service code exist and are documented.                                            |
| Provider execution                         | WORKING       | Provider/brain proxy path exists.                                                                          |
| Lore retrieval                             | WORKING       | Discovery, manifest, and embedding policy exist.                                                           |
| Lore indexing                              | WORKING       | Helper files and safe auto-rebuild logic exist.                                                            |
| Memory database                            | SCAFFOLDED    | SQLite scaffold exists but is not wired into answering.                                                    |
| Docs / schema                              | WORKING       | Registry/schema docs exist, but are not enforced by code.                                                  |
| Scripts / operator tooling                 | WORKING       | Operator guide and mirror CLI tooling exist.                                                               |
| Canon guard / conflict enforcement         | NOT WIRED     | No formal answer-time canon guard layer found.                                                             |
| Skill registry for Mirror-native answering | NOT WIRED     | `src/mirror/skills/` exists, but no formal lore-native skill registry surfaced in docs or answer pipeline. |
| End-to-end lore answer orchestration       | NEEDS CLEANUP | Pieces exist, but path and authority boundaries are not yet unified.                                       |
| Future lore forge / canonization pipeline  | FUTURE        | Docs/specs exist; formal implementation remains future-facing.                                             |

## Known Gaps

- `scroll_index.json` is now auto-maintained during discovery, but helper index data is not yet consumed directly by answer-time retrieval logic.
- `MIRROR_LORE_DIR` is honored by the Python helper script, but the TypeScript lore discovery path does not currently resolve its lore root from that env var automatically.
- The new memory DB scaffold is not wired into Mirror answers, retrieval ranking, or user-context injection.
- The older `memory_ledger` and the new `mirror-memory` scaffold overlap conceptually and need boundary cleanup.
- No formal canon guard layer was found that forces answer generation to prefer canonical scrolls over observations in a single reusable module.
- Schema docs exist, but there is no parser/validator enforcing `SCROLL_SCHEMA.md`.
- Symbol registry exists, but there is no code path indexing symbols as first-class retrieval signals yet.
- The repo documents future routing/skill behavior, but no formal Mirror-native skill registry for lore answering was found as a completed path.
- Runtime/provider docs and milestone naming are partially inconsistent with current repo naming, especially around "MirrorDaemon".

## Repo / Path Realities

Where lore lives now in this workspace:

- Canonical working copy currently exists at `/home/tommy/mirror-runtime/lore-scrolls`

Source of that corpus in this session:

- Copied from `/home/tommy/mirror-v4/lore-scrolls`

Current helper/index file locations:

- `/home/tommy/mirror-runtime/lore-scrolls/_index/FACT_UPDATES.md`
- `/home/tommy/mirror-runtime/lore-scrolls/_index/KEYWORD_INDEX.json`
- `/home/tommy/mirror-runtime/lore-scrolls/_index/SUPERSEDES.json`
- `/home/tommy/mirror-runtime/lore-scrolls/_index/build_scroll_index.py`
- `/home/tommy/mirror-runtime/lore-scrolls/_index/scroll_index.json`

`MIRROR_LORE_DIR` behavior today:

- Python helper script `lore-scrolls/_index/build_scroll_index.py` honors `MIRROR_LORE_DIR`.
- TypeScript auto-index helper `src/mirror/lore_sources/scroll_index.ts` works on the `canonicalDir` passed by runtime code, not directly from `MIRROR_LORE_DIR`.
- This means env-based portability is only partially unified today.

Current mismatch between `mirror-runtime/lore-scrolls` and `~/mirror-v4/lore-scrolls`:

- The workspace now contains a copied snapshot of the `mirror-v4` corpus.
- There is no automatic sync between those two directories.
- Future edits can diverge immediately unless one is declared authoritative.
- The presence of both paths is a current operational risk.

## Recommended Next Steps

Only the next 5 practical tasks are listed here.

1. Unify lore root resolution in TypeScript.
   Make runtime lore discovery resolve canonical lore from `MIRROR_LORE_DIR` first, with a clear fallback strategy. This removes the current Python-vs-TypeScript path split.

2. Add a canon-first retrieval service module.
   Centralize how Mirror loads scrolls, helper indexes, and canonical precedence rules before answer generation. This should be the single retrieval entry point.

3. Wire helper indexes into retrieval ranking.
   Consume `FACT_UPDATES.md`, `SUPERSEDES.json`, `KEYWORD_INDEX.json`, and `scroll_index.json` directly in retrieval so the helper layer actually affects answers.

4. Connect `src/mirror-memory/` to retrieval context.
   Use observations, canon updates, user reflections, and retrieval history as secondary context only, never as canon replacements.

5. Add a schema/canon validation pass for lore corpora.
   Validate filenames, front matter, family/type conventions, symbol usage, and supersession references so future lore growth stays stable.

## Skill Boundary Proposal

The system should separate three skill layers.

### OpenClaw / generic capabilities

Purpose:

- channel handling
- auth
- runtime execution
- provider access
- generic tooling
- telemetry

Examples:

- channel adapters
- provider transports
- daemon/service ops
- generic file/database/network tooling

### Mirror-native skills

Purpose:

- lore retrieval
- canon conflict handling
- symbolic interpretation
- memory-aware reflection
- answer sanitization for Mirror mode

Examples:

- canon-first retrieval skill
- symbolic retrieval/ranking skill
- lore citation skill
- reflection-memory context skill

### Future user-installed skills

Purpose:

- optional domain extensions
- private user lore packs
- community/operator add-ons

Examples:

- custom user lore source adapters
- private project-specific symbolic layers
- operator automation for index rebuild and health checks

Rule of thumb:

- OpenClaw handles infrastructure.
- Mirror-native skills handle lore semantics and answer discipline.
- User-installed skills extend behavior without becoming the canonical core.

## Immediate Recommended Next Implementation

Best next step:

Implement a canon-first retrieval service that unifies lore root resolution, helper index loading, and scroll ranking.

Why this is the best next move:

- It converts the current helper/index work from documentation plus side files into actual answer-time behavior.
- It provides one place to enforce canon-over-observation boundaries.
- It creates the correct insertion point for the memory DB scaffold later.
- It reduces current path/config fragmentation by making `MIRROR_LORE_DIR` part of one authoritative retrieval entry point.
- It is a prerequisite for most of the other gaps in this report.

Suggested implementation boundary:

- New service under `src/mirror/` or `src/mirror/lore_retrieval/`
- Inputs:
  - user query
  - lore root
  - helper indexes
  - optional memory context
- Outputs:
  - ranked canonical scroll candidates
  - supersession/canon update notes
  - retrieval diagnostics for Keeper/operator surfaces
