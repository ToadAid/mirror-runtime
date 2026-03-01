# Lore Forge Pipeline

The Lore Forge is a candidate-generation system that observes user input and produces draft scroll bundles for review.

This system is intentionally gated and log-only by default.

---

## Overview

The pipeline performs:

1. Signal detection
2. Scoring
3. Candidate bundle creation
4. File output
5. Manual review gate

It does NOT modify canon directly.

---

## Scoring Dimensions

Each candidate is evaluated across multiple dimensions:

- Lore Likeness (0–1): Presence of lore keywords and symbols
- Novelty (0–1): How new or non-duplicate the idea is
- Impact (0–1): Potential long-term narrative impact
- Confidence (0–1): Source reliability / recency

If the combined weighted score exceeds the configured threshold, a candidate bundle is generated.

---

## Candidate Creation

When the score threshold is met, a candidate folder is created under:

candidates/<candidate-id>/

Each bundle contains:

- meta.json — Metadata and scoring details
- EN.md — English draft scroll
- ZH.md — Chinese draft (MVP-level translation)
- README.md — Review instructions + status

These bundles remain untrusted until manually reviewed.

---

## Candidate Scroll Format

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
---

## Layer 1: Library Candidate Pipeline (PR#4)

PR#4 adds the library-only candidate pipeline (no runtime wiring).

### Scope

This PR adds ONLY:

- src/plugin-sdk/mirror/lore_forge/ directory with library modules
- tools/test-lore-forge.ts local test harness
- docs/LORE_FORGE_PIPELINE.md documentation

This PR does NOT:

- Wire lore_forge into runtime hooks
- Modify runtime behavior
- Enable feature flags by default
- Change canon directly

### Module Structure

src/plugin-sdk/mirror/lore_forge/
├── index.ts           # Entry point, exports types + helpers
├── types.ts           # TypeScript definitions
├── scoring.ts         # Candidate scoring functions
└── bundle.ts          # Bundle creation helpers (json/jsonl/md)
### Usage (Library-Only)

import {
  scoreCandidate,
  scoreCandidates,
  createJsonBundle,
  createJsonlBundle,
  createMarkdownBundle,
} from "src/plugin-sdk/mirror/lore_forge";

const scored = scoreCandidate(
  { id: "test", content: "Lore content", tags: ["example"] },
  { includeReason: true }
);

const bundle = createJsonBundle(scored, { format: "json" });
### Build Proof

cd ~/mirror-runtime
pnpm -w build
node tools/test-lore-forge.ts
Expected: build passes; tests run; no runtime behavior changes.

---

## Migration

To enable lore forge (when runtime overlay is wired):

MIRROR_LORE_FORGE=1 npm run dev
To change threshold:

MIRROR_LORE_FORGE=1 MIRROR_LORE_FORGE_THRESHOLD=0.8 npm run dev
---

## Testing

Run the test script:

pnpm -w test tools/test-lore-forge.ts
Or build first:

pnpm -w build
---

## Limitations (MVP)

- Basic dictionary-based translation (not production-grade)
- Simple heuristic scoring (no embeddings)
- No automatic deduplication
- No UI for review workflow

---

## Future Improvements

- Real translation API integration
- Embedding-based scoring
- Automatic deduplication
- Web UI for review workflow
- Database-backed candidate tracking