# Lore Forge Candidate Pipeline

## Overview

The Lore Forge is a non-invasive overlay for the Mirror Runtime that automatically detects lore-like signals in user input and creates candidate draft bundles for human/DAO review.

## Key Principles

- **Proposal Only**: Never auto-canonize. Never auto-mint. Always propose.
- **Draft Format**: Candidates are written in minimal "candidate scroll" format.
- **Review Gate**: A candidate is "accepted" only if a maintainer manually moves it into `lore-scrolls/`.
- **Feature Flagged**: Default disabled. Requires explicit activation.

## Architecture

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

## Workflow

### 1. Text Observation

When enabled, the lore forge observes inbound user text in the tools handler.
It does NOT modify state or output — only logs and creates candidates.

### 2. Scoring

The text is scored on:

- **Lore Likeness** (0-1): Presence of lore keywords and symbols
- **Novelty** (0-1): How novel or new this is (simplified for MVP)
- **Impact** (0-1): How much impact this could have
- **Confidence** (0-1): Source reliability (based on recency)

### 3. Candidate Creation

If the combined score exceeds the threshold, a candidate bundle is created.

### 4. File Output

Files are written to `candidates/<candidate-id>/`:

- `meta.json` — Metadata and scores
- `EN.md` — English draft
- `ZH.md` — Chinese draft (basic translation for MVP)
- `README.md` — Reviewer instructions and status

### 5. Review Gate

- **Accepted**: Maintainer moves folder to `lore-scrolls/` with proper TOBY_L numbering
- **Rejected**: Maintainer deletes the folder
- **Under Review**: Maintainer marks in README

## Candidate Scroll Format

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

## Testing

Run the test script:

```bash
pnpm -w test tools/test-lore-forge.ts
```

Or build first:

```bash
pnpm -w build
```

## Migration

To enable lore forge:

```bash
MIRROR_LORE_FORGE=1 npm run dev
```

To change threshold:

```bash
MIRROR_LORE_FORGE=1 MIRROR_LORE_FORGE_THRESHOLD=0.8 npm run dev
```

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
