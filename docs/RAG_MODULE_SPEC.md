# RAG Module Specification

**Version**: 0.1.0
**Status**: Draft for PR#3-docs
**Scope**: Retrieval-augmented generation, lore inference, feature-flagged pipeline

---

## Overview

The RAG (Retrieval-Augmented Generation) module enables the Mirror to reason over the canon lore corpus, not just cached text. This allows for complex queries like "What would Toadgod say about X?" without querying the live internet.

### Key Characteristics

- **Optional**: Must be explicitly enabled via feature flag.
- **Pluggable**: Supports multiple vector store backends (Chroma, Qdrant, embedded).
- **Secure**: No access to secrets, private keys, or wallet signing operations.
- **Stateless**: No external dependencies (data only, no wallet connections).

---

## Feature Flags

| Flag                    | Default | Description                           |
| ----------------------- | ------- | ------------------------------------- |
| `MIRROR_RAG_ENABLED`    | `0`     | Enable RAG module (default: disabled) |
| `MIRROR_RAG_CHUNK_SIZE` | `500`   | Token size per lore chunk             |
| `MIRROR_RAG_TOP_K`      | `6`     | Number of results to retrieve         |

---

## Workflow

### Input → RAG

1. User query received (e.g., `What is the prophecy?`).
2. RAG module enabled? If no, skip RAG (proceed to raw lookup).
3. If yes:
   - Tokenize query.
   - Search vector store for similar lore chunks.
   - Retrieve top-K results (e.g., 6 chunks).

### RAG → Mirror

1. Combine retrieved chunks into context.
2. Pass context + query to Mirror reasoning layer (DeepSeek Mirror).
3. Mirror generates response based on context.
4. Sanitize output (Mirror mode) or retain full output (Keeper mode).

### Optional: New Lore Events Ingestion

- **Trigger**: Admin command (e.g., `Keeper, ingest new lore-scrolls`).
- **Process**:
  1. Scan `lore-scrolls/` directory for new files.
  2. Parse TOBY_L numbers and metadata.
  3. Embed new scrolls into vector store.
  4. Index for future retrieval.
- **Permissions**: Admin-only (no public access).

---

## Storage Boundaries

### What RAG Can Access

- **Lore corpus**: `lore-scrolls/` directory (public, read-only).
- **Vector store**: Embedded index (no external DB dependencies).
- **Metadata**: TOBY_L numbers, scroll titles, source references.

### What RAG Cannot Access

- **Wallet**: No private keys, no signing operations.
- **User data**: No PII, no chat history beyond current query.
- **External APIs**: No live internet (only local lore corpus).
- **Admin commands**: No ingestion commands (manual only).

---

## Vector Store Options

### Option A: Chroma (Recommended)

```bash
# Install
pnpm add @chromadb/utils
# Initialize
const client = new ChromaClient({ url: 'http://localhost:8000' });
const collection = await client.getOrCreateCollection({ name: 'lore' });
```

### Option B: Qdrant

```bash
# Install
pnpm add qdrant-client
# Initialize
const client = new QdrantClient({ url: 'http://localhost:6333' });
const collection = await client.createCollection('lore');
```

### Option C: Embedded (No External DB)

```typescript
import { MemoryVectorStore } from "langchain/vectorstores/memory";
const store = new MemoryVectorStore(embeddings);
```

**Recommendation**: Embedded for MVP; Chroma for production (persistent storage).

---

## Implementation Phases

### Phase 1: MVP (RAG disabled by default)

- Simple keyword lookup over `lore-scrolls/` (no vector store).
- `MIRROR_RAG_ENABLED=0` (default).
- Returns top matches based on string similarity (Levenshtein).

### Phase 2: Vector Store Integration (Feature-flagged)

- `MIRROR_RAG_ENABLED=1` enables vector store.
- Support Chroma and embedded storage.
- Optional: Store to local file (e.g., `data/lore-index.json`).

### Phase 3: New Lore Events Ingestion (Manual)

- Admin command to trigger ingestion.
- Parse new `lore-scrolls/` files.
- Update vector store.

### Phase 4: Advanced Retrieval (Post-RAG)

- Hybrid search (keyword + vector).
- Re-ranking with DeepSeek Mirror.
- Session-based context (previous queries).

---

## Testing

### Unit Tests

- Mode detection (enabled/disabled).
- Sanitization (no leaks).

### Integration Tests

- RAG retrieval (simulated vector store).
- New lore ingestion (manual file scan).
- Edge cases: empty corpus, corrupted files.

### Regression Tests

- No wallet/signing operations.
- No external API calls (offline mode).

---

## Dependencies

### Required

- `@chromadb/utils` (if Chroma used)
- `qdrant-client` (if Qdrant used)
- `langchain` (if using vector stores)

### Optional

- `openai` (for embeddings, if not using local embeddings)

---

## Configuration

### Environment Variables

```bash
# Enable RAG
MIRROR_RAG_ENABLED=1

# Vector store choice (chroma|qdrant|embedded)
MIRROR_RAG_STORE=chroma

# Chroma URL (if using Chroma)
MIRROR_RAG_CHROMA_URL=http://localhost:8000

# Chunk size
MIRROR_RAG_CHUNK_SIZE=500

# Top-K results
MIRROR_RAG_TOP_K=6
```

---

## Security Considerations

- **No private keys**: RAG module never touches wallet or signing operations.
- **No PII**: Only lore corpus (public domain).
- **No external calls**: Offline mode by default.
- **Feature-flagged**: Can be disabled at runtime without code changes.

---

## Related Documentation

- [Runtime Roadmap](./RUNTIME_ROADMAP.md) — Phase 3 (RAG module)
- [Routing Spec](./ROUTING_SPEC.md) — Mirror/Keeper routing
- [Mirror Boundary](./MIRROR_BOUNDARY.md) — Boundary overlay (PR#1)

---

**Status**: Draft for PR#3-docs
**Next Step**: Create PR#3 with this spec and Phase 0–4 roadmap
