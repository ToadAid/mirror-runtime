# Mirror Memory Scaffold

This database scaffold gives Mirror a small local memory layer for observations, helper canon updates, user reflection context, and retrieval history. It is a retrieval aid only. It does not rewrite lore scrolls, and scroll canon remains the highest authority.

SQLite was chosen because it is portable, local-first, and does not require an external service. The database path is resolved from `MIRROR_MEMORY_DB_PATH`, with a default fallback of `./data/mirror-memory.db`.

Table roles:

- `observations`: non-canon memory such as Toadgod tweets, community discussion notes, manual notes, and system observations.
- `canon_updates`: helper entries that describe the current canonical status for a topic and point back to the relevant scroll.
- `user_reflections`: lightweight user-specific context such as language, tone, recurring topics, and journey stage.
- `retrieval_history`: what Mirror used when answering, including linked scrolls and observation ids.

Distinction between canon and observation:

- Canon lives in lore scrolls and stays authoritative.
- Observations are memory for better retrieval and context, not automatic canon promotion.
