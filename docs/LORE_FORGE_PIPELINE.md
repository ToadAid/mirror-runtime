# Lore Forge Candidate Pipeline

## Overview

The Lore Forge is designed as a two-layer system:

1. **Library Layer**: Pure, library-only candidate pipeline for lore generation (PR#4)
2. **Runtime Overlay**: Optional, feature-flagged hook point for runtime behavior (PR#3)

This document merges both perspectives into a single coherent spec.

## Key Principles

- **Proposal Only**: Never auto-canonize. Never auto-mint. Always propose.
- **Draft Format**: Candidates are written in minimal "candidate scroll" format.
- **Review Gate**: A candidate is "accepted" only if a maintainer manually moves it into `lore-scrolls/`.
- **Feature Flagged**: Default disabled. Requires explicit activation.
- **Library-First**: Core logic is pure library; runtime integration is gated and opt-in.

## Layer 1: Library-Only Candidate Pipeline (PR#4)

### Scope

The `lore_forge` library provides:

- `src/plugin-sdk/mirror/lore_forge/` directory with library modules
- `tools/test-lore-forge.ts` local test harness
- Scoring and bundling utilities without runtime hooks

This library does NOT:

- Wire lore_forge into runtime hooks
- Modify runtime behavior
- Add feature flags
- Change existing imports or exports

### Module Structure

### `src/plugin-sdk/mirror/lore_forge/index.ts`

- Entry point for lore_forge library
- Exports: types, scoring, bundle functions

### `src/plugin-sdk/mirror/lore_forge/types.ts`

- Type definitions for LoreCandidate, ScoredCandidate, ScoringParams, BundleConfig

### `src/plugin-sdk/mirror/lore_forge/scoring.ts`

- `scoreCandidate(candidate, params)` — Score a single candidate
- `scoreCandidates(candidates, params)` — Batch scoring
- No runtime hooks, no behavior change

### `src/plugin-sdk/mirror/lore_forge/bundle.ts`

- `createJsonBundle(scored, config)` — JSON bundle generation
- `createJsonlBundle(scored, config)` — JSONL bundle generation
- `createMarkdownBundle(scored, config)` — Markdown bundle generation

### `tools/test-lore-forge.ts`

- Local test harness to validate library functions
- Runs without runtime hooks

### Usage (Library-Only)

```typescript
import {
  scoreCandidate,
  scoreCandidates,
  createJsonBundle,
  createJsonlBundle,
  createMarkdownBundle,
} from "src/plugin-sdk/mirror/lore_forge";

// Score a candidate
const scored = scoreCandidate(
  {
    id: "test",
    content: "Lore content",
    tags: ["example"],
  },
  { includeReason: true },
);

// Create a bundle
const bundle = createJsonBundle(scored, { format: "json" });
```

### Build Proof

```bash
pnpm -w test tools/test-lore-forge.ts
```

## Layer 2: Runtime Overlay (PR#3)

### Architecture

### Module Structure

```
src/plugin-sdk/mirror/lore_forge/
├── index.ts           # Main entry point, feature flags, hook function
├── types.ts           # TypeScript definitions for bundles and metadata
├── scoring.ts         # Lore-likeness, novelty, impact scoring
└── bundle.ts          # Bundle creation, file writing, translation
```

### Feature Flags

| Flag                          | Default | Description                                   |
| ----------------------------- | ------- | --------------------------------------------- |
| `MIRROR_LORE_FORGE`           | `0`     | Enable/disable lore forge (default: disabled) |
| `MIRROR_LORE_FORGE_THRESHOLD` | `0.72`  | Minimum combined score to create candidate    |
| `MIRROR_LORE_LANG_AUTODETECT` | `1`     | Enable automatic language detection           |

### Workflow

#### 1. Text Observation

When enabled, the lore forge observes inbound user text in the tools handler.
It does NOT modify state or output — only logs and creates candidates.

#### 2. Scoring

The text is scored on:

- **Lore Likeness** (0-1): Presence of lore keywords and symbols
- **Novelty** (0-1): How novel or new this is (simplified for MVP)
- **Impact** (0-1): How much impact this could have
- **Confidence** (0-1): Source reliability (based on recency)

#### 3. Candidate Creation

If the combined score exceeds the threshold, a candidate bundle is created.

#### 4. File Output

Files are written to `candidates/<candidate-id>/`:

- `meta.json` — Metadata and scores
- `EN.md` — English draft
- `ZH.md` — Chinese draft (basic translation for MVP)
- `README.md` — Reviewer instructions and status

#### 5. Review Gate

- **Accepted**: Maintainer moves folder to `lore-scrolls/` with proper TOBY_L numbering
- **Rejected**: Maintainer deletes the folder
- **Under Review**: Maintainer marks in README

### Candidate Scroll Format

```markdown
# CANDIDATE — <short title>

## Source Summary

...

## Detected Symbols

...

## Why It Might Matter

...

## Draft Narrative

...

## Reviewer Notes

...
```

### Do NOT

- Assign final TOBY_L numbers
- Touch existing lore-scrolls
- Edit final canon directly

### Do

- Create minimal drafts for review
- Mark as "Under Review"
- Leave status for maintainer to complete

## File Structure

```
candidates/
├── candidate-1735234567-abc123/
│   ├── meta.json
│   ├── EN.md
│   ├── ZH.md
│   └── README.md
└── ...
```

## Hook Point

The lore forge hook is called in:
**File**: `src/agents/pi-embedded-subscribe.handlers.tools.ts`
**Function**: `observeUserText()` is called after user text is received but before processing

The hook is guarded and log-only unless explicitly enabled.

## Migration

To enable lore forge:

```bash
MIRROR_LORE_FORGE=1 npm run dev
```

To change threshold:

```bash
MIRROR_LORE_FORGE=1 MIRROR_LORE_FORGE_THRESHOLD=0.8 npm run dev
```

## Testing

Run the test script:

```bash
pnpm -w test tools/test-lore-forge.ts
```

## Status Summary

- **Library candidate pipeline**: Exists, tested, green build (PR#4) ✅
- **Runtime endpoints**: Not implemented yet (PR#3 docs only) ⏳
- **Forge UI contracts**: Tracked separately in RUNTIME_ROADMAP.md 📋

## Limitations (MVP)

- Basic dictionary-based translation (not production-grade)
- Simple heuristic scoring (no embeddings)
- No automatic deduplication
- No UI for review workflow

Future improvements could include:

- Real translation API integration
- Embedding-based scoring
- Automatic deduplication
- Web UI for review workflow
- Database-backed candidate tracking
