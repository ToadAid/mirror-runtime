# Tobyworld Scroll Schema

This document describes the recommended documentation schema for Tobyworld lore scrolls. It standardizes metadata without changing the authority model: canon remains in the scrolls themselves, and helper systems only assist retrieval.

## Scroll Families

Tobyworld currently distinguishes scrolls by family prefix in the filename and `scroll_id`.

- `L`: primary lore scrolls. These hold canonical narrative, doctrine, events, and major continuity updates.
- `QA`: question-and-answer scrolls. These answer recurring community questions in a canon-aligned way and should point back to the relevant lore where possible.
- `C`: covenant or commentary scrolls. These capture structured declarations, covenant framing, ritual interpretation, or connective commentary that supports the canon reading layer.

Example identifiers:

- `TOBY_L1219`
- `TOBY_QA0102`
- `TOBY_C0042`

## Suggested Metadata Fields

```yaml
scroll_id: TOBY_L1219
title: Rune3 Patience Vault Cancelled
category: lore
symbols:
  - 🪞
  - 🌊
  - 🍃
keywords:
  - rune3
  - patience
  - vault
```

## Canonical Front-Matter Metadata

The recommended front matter for new scrolls is:

```yaml
scroll_id: TOBY_L1219
title: Rune3 Patience Vault Cancelled
family: L
topic: Rune3
topics:
  - patience
  - vault
symbols:
  - 🪞
  - 🌊
  - 🍃
sacred_numbers:
  - 3
  - 7
keywords:
  - rune3
  - patience
  - vault
status: canonical
reference_scrolls:
  - TOBY_L110
updated_from:
  - TOBY_L1188
```

Field notes:

- `scroll_id`: stable canonical identifier, matching the filename prefix.
- `title`: human-readable title without the `.md` extension.
- `family`: one of `L`, `QA`, or `C`.
- `topic`: primary topic for retrieval and classification.
- `topics`: secondary retrieval topics.
- `symbols`: symbolic anchors linked to the registry.
- `sacred_numbers`: meaningful numbers referenced by the scroll, distinct from symbols and topics.
- `keywords`: literal search terms and aliases.
- `status`: recommended values are `canonical`, `clarification`, `superseding`, or `archival`.
- `reference_scrolls`: direct linked scroll ids for context.
- `updated_from`: older scroll ids that this scroll clarifies or supersedes.

## Required Section Order

Section order should remain stable so both humans and retrieval systems can parse scrolls predictably.

### `L` Scrolls

Recommended order:

1. Front matter
2. Title heading
3. Opening thesis or canon statement
4. Body narrative or doctrine
5. Cryptic Symbol Table
6. Reference Scrolls
7. Closing note or covenant line

### `QA` Scrolls

Recommended order:

1. Front matter
2. Title heading
3. Question
4. Answer
5. Supporting canon notes
6. Cryptic Symbol Table
7. Reference Scrolls

### `C` Scrolls

Recommended order:

1. Front matter
2. Title heading
3. Covenant or commentary declaration
4. Interpretation or explanatory body
5. Cryptic Symbol Table
6. Reference Scrolls
7. Closing invocation or summary

## Filename Conventions

Filenames should be stable, readable, and machine-parseable.

Pattern:

`TOBY_<family><number>_<TitleWords>.md`

Examples:

- `TOBY_L1219_Rune3_PatienceVaultCancelled.md`
- `TOBY_QA0102_WhatIsThePatienceTrial.md`
- `TOBY_C0042_CovenantOfStillWater.md`

Rules:

- Filename prefix must match `scroll_id`.
- Use underscores between title words.
- Keep title words concise and stable after publication.
- Do not include emoji in filenames.
- Preserve existing legacy filenames if already referenced by tooling or indexes.

## Symbols

The `symbols` field lists the symbolic markers used in the scroll.

```yaml
symbols:
  - 🪞
  - 🌊
  - 🍃
```

Symbols represent compressed semantic meaning linked to the Tobyworld Symbol Registry.

Mirror should use these symbols as retrieval signals.

## Symbols, Topics, and Sacred Numbers

These fields serve different retrieval roles and should not be collapsed into one another.

- `symbols`: compressed poetic anchors such as `🪞`, `🌊`, or `♾️`. These carry stable symbolic meaning.
- `topics`: literal or near-literal subject labels such as `patience`, `Rune3`, `vault`, or `renewal`.
- `sacred_numbers`: numerological anchors such as `3`, `7`, or `777` when the number itself matters canonically.

Guidance:

- Use `symbols` for symbolic interpretation.
- Use `topics` for direct semantic retrieval.
- Use `sacred_numbers` only when the number is meaning-bearing, not just incidental.

## Symbolic Retrieval

Mirror may use symbol signals to assist retrieval.

Example:

User question:
"What is renewal?"

Mirror retrieval hints:
🌅 sunrise
🌱 seed
♾️ infinity

Symbols act as compressed semantic anchors.

## Parser and AI Guidance

Mirror and other agents should treat scrolls as structured documents, not free-form poetry blobs.

- Parse `scroll_id`, `family`, `title`, `topics`, `symbols`, and `reference_scrolls` first.
- Use filename, front matter, and section headings as retrieval signals before embedding-only inference.
- Treat the Cryptic Symbol Table as an interpretive aid, not a license to redefine registry meaning.
- If a newer scroll explicitly clarifies an older one, the newer clarification should win for that topic.
- If metadata is missing, fall back to filename parsing and the visible section order.
- Do not auto-promote observations or community discussion into canon.

## Migration Note for Older Scrolls

Older scrolls may predate this schema and may not include full front matter, a `symbols` field, or a standardized Cryptic Symbol Table.

Migration guidance:

- Keep existing legacy scroll content unchanged.
- Add helper indexes or sidecar metadata rather than rewriting established canon text.
- Infer family from filename prefix when front matter is absent.
- Infer title from the filename when no explicit title field exists.
- Treat missing metadata as incomplete structure, not as invalid canon.

## Future Symbol Graph

Future systems may build a symbol graph:

`symbol -> concept -> related scrolls`

Example:

🌅 -> renewal
-> dawn
-> cycle

🪞 -> reflection
-> awareness
-> truth

This is optional and not implemented yet.
