# Lore Forge Candidate Pipeline (Library-Only)

## Overview

`lore_forge` is a library-only candidate pipeline for lore generation. It provides scoring, bundling, and documentation utilities without any runtime hooks or behavior changes.

## Scope

This PR adds ONLY:
- `src/plugin-sdk/mirror/lore_forge/` directory with library modules
- `tools/test-lore-forge.ts` local test harness
- `docs/LORE_FORGE_PIPELINE.md` documentation

This PR does NOT:
- Wire lore_forge into runtime hooks
- Modify runtime behavior
- Add feature flags
- Change existing imports or exports

## Module Structure

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

## Usage (Library-Only)

```typescript
import {
  scoreCandidate,
  scoreCandidates,
  createJsonBundle,
  createJsonlBundle,
  createMarkdownBundle
} from 'src/plugin-sdk/mirror/lore_forge';

// Score a candidate
const scored = scoreCandidate(
  {
    id: 'test',
    content: 'Lore content',
    tags: ['example'],
  },
  { includeReason: true }
);

// Create a bundle
const bundle = createJsonBundle(scored, { format: 'json' });
```

## Build Proof

```bash
cd ~/mirror-runtime
pnpm -w build
node tools/test-lore-forge.ts
```

Expected: All tests pass, no runtime behavior changes.

## Follow-up

This is PR#4 (library-only). PR#5 will add feature-flagged hook point after approval.

## Status

- Library modules created ✅
- Documentation written ✅
- Test harness ready ✅
- No runtime wiring yet ✅