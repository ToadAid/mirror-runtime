# Runtime Roadmap

**Version**: 0.1.0
**Status**: Pre-Merge Planning
**Target**: Merge PR#1 + PR#2 before any new features

---

## Phase 0: Foundation (Current Sprint)

**Goal**: Establish baseline infrastructure with minimal changes.

### Deliverables

- ✅ **PR#1** — `docs/MIRROR_BOUNDARY.md` (boundary overlay documentation)
- ✅ **PR#2** — NOOP hook placeholder in `src/plugin-sdk/mirror/lore_forge/`

### Scope

- Documentation only (no engine mutations)
- Feature flags: `MIRROR_BOUNDARY`, `MIRROR_LORE_FORGE`
- Optional: `MIRROR_LORE_FORGE_THRESHOLD` config
- No breaking changes to engine

---

## Phase 1: Channel Router (Next Sprint)

**Goal**: Implement bidirectional routing between Mirror and Keeper modes.

### Specification

- **File**: `docs/ROUTING_SPEC.md` (to be created in PR#3)
- **Trigger Patterns**:
  - Mirror route: Message prefix `Mirror,` OR channel tag `#mirror`
  - Keeper route: Message prefix `Keeper,`
  - Default: Auto-detect based on channel (public ↔ private)

### Output Discipline

- **Mirror**: Returns answer-only. Strips meta/debug fields.
- **Keeper**: May show ops info, debug details, file paths.
- **Sanitization**: Mirror output sanitized for public consumption.

### Language Handling

- Auto-detect EN/ZH from input.
- Allow override via explicit tag (`#en`, `#zh`).
- Mirror responses in detected language.

---

## Phase 2: Connector Adapters (Following Sprint)

**Goal**: Build pluggable connector adapters for public-facing channels.

### Channels

- **Telegram**: `/ask` command, bot mention (`@mirror`), inline UI
- **Web**: Public endpoint `/ask`, search interface
- **WhatsApp**: Bot command `/mirror`, reply flow
- **Discord**: Command `.mirror`, slash command `/ask`

### Requirements

- Feature-flagged: `MIRROR_CHANNEL_TELEGRAM`, `MIRROR_CHANNEL_WEB`, etc.
- Adapter pattern: `src/channels/mirror-*.ts`
- Configurable timeouts, rate limits, fallback behavior.

---

## Phase 3: Agentic RAG Module (Post-Foundation)

**Goal**: Add retrieval-augmented generation for lore inference.

### Rationale

- Mirror should reason over canon lore, not just query cached text.
- RAG enables: "What would Toadgod say about X?" type queries.

### Scope

- **File**: `docs/RAG_MODULE_SPEC.md` (to be created in PR#3)
- Optional, feature-flagged: `MIRROR_RAG_ENABLED=1`
- Pluggable vector store (Chroma, Qdrant, or embedded).
- Storage boundaries: No secrets, no private keys, no wallet signing.

### Workflow

1. User query received.
2. RAG module searches lore corpus (not real-time internet).
3. Context augmented to Mirror reasoning layer.
4. Response generated and sanitized.
5. Optional: "new lore events" ingestion pipeline.

---

## Phase 4: Lore Forge Capability (After RAG)

**Goal**: Enable community contribution pipeline (draft → canon).

### Background

- Currently, lore-scrolls are maintained manually.
- Lore Forge creates candidate scrolls from user messages.

### Deliverables (PR#3-docs only)

- `src/plugin-sdk/mirror/lore_forge/` module (already drafted, not implemented yet)
- Review workflow: Maintainer accepts/rejects candidates.
- Manual canonization: TOBY_L numbering assigned after review.

### Principles

- **Proposal Only**: Never auto-canonize.
- **Draft Format**: Minimal candidate scroll (not final canon).
- **Review Gate**: Manual acceptance required.
- **Feature Flagged**: Default disabled.

---

## Summary

| Phase   | Status      | Priority | Dependencies |
| ------- | ----------- | -------- | ------------ |
| Phase 0 | ✅ Complete | High     | —            |
| Phase 1 | 📋 Planned  | High     | Phase 0      |
| Phase 2 | 📋 Planned  | Medium   | Phase 1      |
| Phase 3 | 📋 Planned  | Medium   | Phase 2      |
| Phase 4 | 📋 Planned  | Low      | Phase 3      |

**Next Action**: Create PR#3 (docs only) — `docs: runtime roadmap + routing boundary spec`

**Do NOT implement** any new features until PR#1 + PR#2 are reviewed and merged.
