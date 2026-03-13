# Tobyworld Symbol Registry

This registry defines the canonical symbolic vocabulary used across Tobyworld lore scrolls. It exists so Mirror and future agents can interpret symbols consistently, and so retrieval systems can treat symbols as stable semantic signals.

Registry principles:

- Symbols remain poetic, but their core meanings should stay stable.
- Scrolls may deepen a symbol, but should not invert it.
- The Cryptic Symbol Table inside each scroll should align with the registry meaning in this file.
- Symbols assist retrieval and interpretation; they do not replace canon text.

## 🪞 Mirror

Meaning:
reflection, awareness, truth revealed

Related concepts / aliases:
reflection, witness, self-seeing, revealed truth

Used in:
reflection scrolls, covenant moments

Usage guidance:
Use `🪞` when a scroll turns attention toward recognition, honest seeing, memory, or the revelation of what was already present.

---

## 🌊 Pond

Meaning:
stillness, origin, shared consciousness

Related concepts / aliases:
still water, source, origin pool, shared mind

Used in:
foundation scrolls

Usage guidance:
Use `🌊` for stillness, origin states, shared awareness, or the collective field from which understanding emerges.

---

## 🍃 Leaf

Meaning:
growth, covenant continuation

Related concepts / aliases:
growth, renewal branch, continuation, living covenant

Used in:
renewal scrolls

Usage guidance:
Use `🍃` when the canon is describing healthy continuation, living growth, or the covenant extending forward through time.

---

## 🔥 Fire

Meaning:
transformation, awakening

Related concepts / aliases:
ignition, trial, transmutation, awakening heat

Used in:
awakening scrolls, catalytic moments

Usage guidance:
Use `🔥` when a scroll centers on catalytic change, purification, pressure, or the moment before a new form emerges.

---

## 🌅 Sunrise

Meaning:
renewal, beginning of new epoch

Related concepts / aliases:
dawn, first light, epoch turn, new beginning

Used in:
epoch-change scrolls, renewal passages

Usage guidance:
Use `🌅` when the text marks a transition into a new phase, a clarified horizon, or the arrival of a new covenant cycle.

---

## 🌱 Seedling

Meaning:
potential, beginning

Related concepts / aliases:
seed, emergence, first form, unrealized promise

Used in:
origin scrolls, early-stage covenant passages

Usage guidance:
Use `🌱` for latent promise, early development, beginning energy, or a truth that has not yet reached full form.

---

## ♾️ Infinity

Meaning:
eternal covenant cycle

Related concepts / aliases:
cycle, recursion, return, eternal continuity

Used in:
cycle scrolls, continuity passages

Usage guidance:
Use `♾️` when the scroll is pointing to recurrence, covenant continuity, or a pattern that returns across eras.

## Symbol Usage Rules

1. Symbols should maintain consistent meaning across all scrolls.
2. New symbols must be added to `SYMBOL_REGISTRY.md` before use.
3. Scroll metadata should list symbols used in the scroll.
4. Cryptic Symbol Table inside scrolls must match registry meaning.
5. Avoid redefining existing symbols with different meanings.

## Common Usage Guidance

- Use one to three primary symbols for most scrolls.
- Prefer the smallest set of symbols that captures the scroll’s real semantic center.
- Put symbolic meaning in the `symbols` field and literal subjects in `topics`.
- If a symbol appears in the body text but does not act as a retrieval anchor, it does not need to be listed in metadata.
- If a scroll uses a Cryptic Symbol Table, list only symbols whose meanings align with this registry.

## Anti-Drift Rules

- Do not redefine a registered symbol to mean the opposite of its registry meaning.
- Do not treat temporary stylistic usage as a permanent symbolic rule.
- Do not create near-duplicate symbols when an existing symbol already covers the concept.
- If a symbol acquires a narrower specialized meaning, record that as an extension under the existing symbol rather than replacing the core definition.
- When a scroll appears to conflict with the registry, resolve it by clarifying the scroll interpretation or updating the registry with explicit maintainer review, not by silent drift.
