# Mirror Runtime Architecture Report

## Overview

Mirror Runtime is organized around a canon-first lore system with three main operational layers:

1. Runtime serving and answer generation under `src/runtime/`
2. Mirror domain modules under `src/mirror/`
3. Mirror memory persistence under `src/mirror-memory/`

At a high level:

- the runtime receives HTTP requests
- canon-first retrieval runs before model execution
- lore context is built from canonical scroll excerpts first
- secondary memory context is appended after canon
- the provider/model call is made through the existing brain endpoint
- Mirror-native tools are exposed separately through runtime API endpoints

The system is deliberately split between:

- retrieval and canon interpretation
- canon authoring and validation
- runtime API serving
- optional skill/tool execution

## Major Modules

### Runtime

Path: `src/runtime/`

- `server.ts`
  Starts the Express runtime server and mounts API surfaces.
- `brain-chat.ts`
  Main answer-generation path. Injects retrieval-built canon context before the model call.
- `health.ts`
  Returns runtime health information.

Responsibility:
Own the HTTP surface and request pipeline. It should not own lore parsing logic or provider-specific lore access.

### Lore Sources

Path: `src/mirror/lore_sources/`

- `policy.ts`
  Resolves lore root, including `MIRROR_LORE_DIR` fallback behavior.
- `scroll_index.ts`
  Builds and refreshes `_index/scroll_index.json`.
- `discover.ts`
  Discovers lore files and runs corpus validation.

Responsibility:
Own lore root resolution, file discovery, and index freshness.

### Lore Retrieval

Path: `src/mirror/lore_retrieval/`

- `service.ts`
  Canon-first retrieval engine. Loads helper indexes, symbol registry, and memory context, then ranks scroll candidates.
- `context_builder.ts`
  Token-aware lore context assembler. Selects section excerpts and appends secondary memory context.
- `symbol_registry.ts`
  Parses `docs/lore/SYMBOL_REGISTRY.md` into symbol-to-concept mappings.

Responsibility:
Be the only lore retrieval entry point used by runtime answer generation and retrieval-facing skills.

### Lore Validation

Path: `src/mirror/lore_validation/`

- `validator.ts`
  Warn-only validation for filename pattern, frontmatter, symbol usage, anchors, and supersedes references.

Responsibility:
Protect the corpus from drift and validate new drafts in corpus context.

### Mirror Memory

Path: `src/mirror-memory/`

- `db.ts`
  SQLite DB initialization and path resolution via `MIRROR_MEMORY_DB_PATH`.
- `schema.sql`
  Tables for observations, canon updates, user reflections, retrieval history.
- `repository.ts`
  Minimal DB access helpers.

Responsibility:
Store non-canonical memory that can improve retrieval, while remaining explicitly subordinate to canon.

### Mirror Skills

Path: `src/mirror/skills/`

Custom Tobyworld-facing skills:

- `find_scroll/`
- `canon_fact/`
- `forge_scroll/`
- `commit_scroll/`
- `interpret_tweet/`

Other built-in Mirror skills also exist under `builtins/` for non-lore use cases.

Responsibility:
Wrap core Mirror capabilities behind callable skill interfaces. Skills should compose retrieval, validation, and authoring helpers rather than reimplementing them.

### Skill Registry

Path: `src/mirror/skills/registry/`

- registers tool metadata
- exposes simple input schemas
- routes execution to the correct skill wrapper

Responsibility:
Provide a callable tool surface for agents and external callers.

## Runtime Pipeline

### User Query to Final Answer

1. Request enters `POST /api/brain/chat` in [server.ts](/home/tommy/mirror-runtime/src/runtime/server.ts).
2. `handleBrainChatEndpoint` in [brain-chat.ts](/home/tommy/mirror-runtime/src/runtime/brain-chat.ts) validates request structure.
3. The latest user message is extracted as the retrieval query.
4. `retrieveCanonicalScrolls(...)` in [service.ts](/home/tommy/mirror-runtime/src/mirror/lore_retrieval/service.ts) runs canon-first retrieval.
5. Retrieval loads:
   - lore root from `MIRROR_LORE_DIR` or `./lore-scrolls`
   - helper indexes from `lore-scrolls/_index/`
   - symbol registry from `docs/lore/SYMBOL_REGISTRY.md`
   - optional memory context from SQLite
6. Retrieval ranks canonical scroll candidates using:
   - keyword index matches
   - token overlap
   - supersedes metadata
   - fact update references
   - symbol-aware boosts
7. `buildLoreContext(...)` in [context_builder.ts](/home/tommy/mirror-runtime/src/mirror/lore_retrieval/context_builder.ts) selects relevant scroll sections within a token budget.
8. Memory observations, user reflection, and retrieval history are appended under `Secondary Context (Observations)` only after canon context.
9. A new system message is prepended to the outbound model prompt.
10. The runtime calls the external brain/provider endpoint with the enriched prompt.
11. The provider response is returned unchanged to the caller.

### Canon Precedence

Canon precedence is enforced in two places:

- retrieval ranks and returns canonical scrolls as the primary source
- context builder explicitly states canon overrides memory observations

The model/provider layer never reads lore files directly.

### Tool Usage in the Runtime Path

There is no automatic in-band tool execution inside `brain-chat.ts` today.

Current status:

- retrieval is automatic in answer generation
- tool execution is exposed through separate HTTP endpoints
- agent orchestration of tools must happen outside the current brain-chat pipeline

## Canon Authoring Pipeline

### Interpret Tweet

Path: [interpret_tweet.ts](/home/tommy/mirror-runtime/src/mirror/skills/interpret_tweet/interpret_tweet.ts)

- takes raw Toadgod tweet text
- suggests symbols using the registry
- queries canon-first retrieval for similar existing scrolls
- returns a structured interpretation and `forge_scroll_payload`

This is interpretation only. It does not create or commit canon.

### Forge Scroll

Path: [forge_scroll.ts](/home/tommy/mirror-runtime/src/mirror/skills/forge_scroll/forge_scroll.ts)

- turns structured author intent into a schema-shaped draft scroll
- fills frontmatter
- suggests symbols
- uses placeholder numbering such as `TOBY_L0000`
- validates the generated draft in isolation

This produces a candidate draft, not canonical output.

### Commit Scroll

Path: [commit_scroll.ts](/home/tommy/mirror-runtime/src/mirror/skills/commit_scroll/commit_scroll.ts)

- resolves the canon lore root
- infers `L`, `QA`, or `C`
- scans existing corpus to find the highest family-specific number
- assigns the next number for that family
- replaces placeholder numbering
- validates the finalized draft against corpus context
- writes the new file if validation passes
- refreshes `scroll_index.json`

It does not modify existing canonical scrolls. It only adds new ones.

### Validator

Path: [validator.ts](/home/tommy/mirror-runtime/src/mirror/lore_validation/validator.ts)

The validator checks:

- filename pattern
- frontmatter presence and required fields
- symbol registry consistency
- anchor references
- supersedes references

In discovery it is warn-only. In `commit-scroll`, warnings are treated as a stop condition before write.

### Index Refresh

Path: [scroll_index.ts](/home/tommy/mirror-runtime/src/mirror/lore_sources/scroll_index.ts)

After a successful commit, `ensureScrollIndexUpToDate(...)` refreshes the scroll index so the new scroll is immediately retrievable.

## Implemented Mirror-Native Skills

Mirror-owned lore and authoring skills:

- `find-scroll`
- `canon-fact`
- `forge-scroll`
- `commit-scroll`
- `interpret-tweet`

Other implemented Mirror skills in the repo:

- `mirror.find_scroll` builtin wrapper
- `echo`
- `chain_token_state`
- `chain_token_balance`
- `chain_wallet_profile`

Important boundary note:

- the lore-focused skills above exist as direct modules under `src/mirror/skills/`
- the current tool registry only exposes `mirror.find-scroll`, `mirror.canon-fact`, and `mirror.forge-scroll`
- `commit-scroll` and `interpret-tweet` are implemented but not yet wired into the runtime tool registry

## Runtime API Endpoints

Current runtime endpoints in [server.ts](/home/tommy/mirror-runtime/src/runtime/server.ts) and the canonical gateway/service layer:

- `GET /health`
- `POST /api/brain/chat`
- `GET /mirror/tools`
- `POST /mirror/tools/:tool_name`

Behavior summary:

- `/api/brain/chat` performs retrieval-enhanced answer generation
- `/mirror/tools` lists registered Mirror tool metadata and schemas
- `/mirror/tools/:tool_name` validates input and executes the routed tool

## Skill System Evaluation

### Registry

Strengths:

- simple and readable
- explicit registration model
- tool metadata and schemas are colocated with execution routes

Weaknesses:

- registry coverage is incomplete relative to implemented skills
- there are now two concepts in play:
  - generic `MirrorSkill`
  - HTTP-callable `MirrorSkillTool`
- `discover.ts` and the tool registry are partially separate worlds

Assessment:

- working, but not yet a complete single source of truth for Mirror capabilities

### Schema Validation

Strengths:

- API boundary does lightweight shape validation
- enum checks exist for string-enum fields

Weaknesses:

- validation is shallow
- arrays and objects are not deeply validated
- per-skill validation is duplicated:
  - one pass at the API layer
  - another pass inside each skill function

Assessment:

- adequate for current local use, but not strong enough for wider agent or UI integration

### Execution Routing

Strengths:

- clear lookup by tool name
- tool execution is isolated from provider code

Weaknesses:

- no common result envelope beyond route-level wrapping
- no authorization or policy layer around sensitive tools such as future canon-writing tools
- no audit trail yet for tool execution

Assessment:

- clean for early-stage integration, but missing governance features

## Architectural Gaps and Risks

### 1. Skill Registry Coverage Gap

`commit-scroll` and `interpret-tweet` are implemented but not exposed through the current tool registry. That creates a drift risk where available capabilities differ depending on whether code imports modules directly or uses the runtime tool API.

### 2. Duplicate Input Validation

Skill modules validate their own inputs, while the HTTP gateway layer also validates request payloads. This is not catastrophic, but it is duplicated logic and can drift.

### 3. Retrieval-Service Ownership Is Good, But Not Yet Universal

Answer generation uses the retrieval core correctly. Lore-facing skills also reuse it. That is the right direction. The remaining risk is future code accidentally reading lore files directly instead of going through retrieval or authoring helpers.

### 4. Commit Scroll Uses Direct Filesystem Writes

`commit-scroll` writes the final file directly after validation. It does not use a temporary file plus atomic rename. For a local-first system this is often acceptable, but atomic write semantics would be safer.

### 5. Canon Integrity Depends on a Warn-Oriented Validator

The validator was designed as warn-only for discovery. `commit-scroll` treats warnings as blocking, which is good, but the validation model still mixes operational drift reporting and authoring gatekeeping in one module.

### 6. Symbol Parsing Is Documentation-Driven

The symbol registry is parsed from Markdown documentation. That keeps humans and code close together, but it is a brittle source format compared with a dedicated machine-readable registry.

### 7. Memory Is Loaded in Retrieval, But Not Yet Fully Managed

Retrieval can use observations, reflections, and history. However:

- there is no explicit write path from runtime answers into retrieval history shown here
- there is no policy boundary for when observations may be considered relevant
- memory weighting is relatively simple

This is usable but still early-stage.

### 8. Tool API Has No Auth or Capability Policy Layer

`/mirror/tools/:tool_name` executes registered tools once input validates. For local development that is reasonable. For broader deployment, canon-authoring or filesystem-writing tools need stronger access control and auditing.

### 9. Module Ownership Is Mostly Clear, With One Ambiguity

There are two memory-related areas:

- `src/mirror-memory/`
- `src/mirror/memory_ledger/`

They appear to serve different purposes, but the naming overlap can confuse ownership and future contributors.

## Future Extension Points

### New Skills

Best extension seam:

- add skill module under `src/mirror/skills/<skill_name>/`
- reuse retrieval, validation, or memory repositories
- register it in the tool registry if it should be callable over the runtime API

What is missing:

- a single manifest-driven skill registration system
- consistent schema generation and validation

### UI Integration

`GET /mirror/tools` already provides a discovery surface that a UI can use for:

- tool listing
- dynamic forms
- operator consoles
- authoring workflows

The current schema is simple enough for a lightweight form renderer, but richer schema support would help.

### External Agent Integration

The tool API is the current extension seam for external agents.

Agents can:

- discover tool metadata
- validate expected input shape
- call tools via HTTP

The next maturity step would be:

- auth
- capability restrictions
- structured diagnostics and trace IDs

## Suggested Architectural Improvements

### 1. Unify Skill Registration

Make every Mirror-native skill register once in a single registry and derive:

- API exposure
- discovery metadata
- input schema
- execution routing

from that one source. This removes drift between implemented modules and exposed tools.

### 2. Introduce a Shared Schema and Validation Layer

Replace the current shallow API validation plus per-skill manual checks with one reusable schema-driven validator. That will reduce duplication and make UI and agent integrations more reliable.

### 3. Add Atomic Commit Semantics for Canon Writes

Update `commit-scroll` to:

- write to a temp file
- validate final path assumptions again
- rename atomically

This lowers the risk of partial writes or race-related inconsistencies.

### 4. Split Discovery Validation from Authoring Gate Validation

Keep corpus drift warnings for passive discovery, but introduce a separate explicit authoring validator profile for new canon writes. That clarifies intent and prevents one validator from carrying two subtly different responsibilities.

### 5. Add Tool Authorization and Audit Logging

Before exposing more write-capable tools, add:

- authentication
- tool-level allowlists or capability classes
- execution logging

This is the main hardening step needed before broader operator or agent use.

## System Diagram

```text
Lore Corpus (lore-scrolls/, _index/, SYMBOL_REGISTRY.md)
        |
        v
Lore Sources (policy, discovery, scroll_index)
        |
        v
Lore Retrieval Service --------------------> Mirror Memory (SQLite, observations, reflections, history)
        |                                              |
        v                                              |
Context Builder <--------------------------------------+
        |
        v
Runtime Brain Chat (/api/brain/chat)
        |
        v
Provider / Brain Endpoint

Mirror Skills (find-scroll, canon-fact, forge-scroll, commit-scroll, interpret-tweet)
        |
        v
Skill Registry / Tool Routing
        |
        v
Runtime Tool API (/mirror/tools, /mirror/tools/:tool_name)
```

## Summary

The core architecture is coherent in the most important place: answer generation is canon-first, retrieval-owned, and provider-decoupled. The authoring path is also taking shape in the right order: interpret, forge, validate, commit, reindex.

The main architectural work still needed is not another feature. It is consolidation:

- unify skill registration
- harden write paths
- centralize validation
- add authorization around write-capable tools

Those changes would improve stability more than adding another standalone skill.
