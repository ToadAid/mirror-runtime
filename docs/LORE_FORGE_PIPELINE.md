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

## Layer 2: Runtime Overlay (PR#3)

### Architecture

The runtime overlay connects the forge pipeline to the Mirror runtime.

It is guarded by feature flags and does not execute by default.

### Module Structure

src/plugin-sdk/mirror/lore_forge/
├── index.ts           # Entry point, feature flags, hook function
├── types.ts           # TypeScript definitions for bundles and metadata
├── scoring.ts         # Lore-likeness, novelty, impact scoring
└── bundle.ts          # Bundle creation, file writing, translation

---

## Migration

To enable lore forge:

MIRROR_LORE_FORGE=1 npm run dev

---

## Testing

Run the test script:

pnpm -w test tools/test-lore-forge.ts

---

## Status Summary

- Library candidate pipeline: Exists, tested, green build (PR#4) ✅  
- Runtime endpoints: Not implemented yet (PR#3 docs only) ⏳  
- Forge UI contracts: Tracked separately in RUNTIME_ROADMAP.md 📋  

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