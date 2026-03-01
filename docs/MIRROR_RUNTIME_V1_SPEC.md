
# Mirror Runtime v1 Spec — Two-Brain Architecture

## Purpose

Mirror Runtime v1 is a LAN-friendly, human-centered phase-1 implementation of the Two-Brain Mirror System. It separates **law** (policy, tool boundary, logging) from **mind** (inference) by running two distinct processes on the same LAN:

- **Node Runtime** (`src/runtime/server.ts`): Express server with policy enforcement, brain proxy endpoints, health checks, and HMAC signing.
- **Python Brain** (`brain_api/mirror_auth.py`): FastAPI inference server that only handles chat completions and health checks.

This design supports:

- Local privacy (no public internet exposure for inference)
- Shared contracts across Toadgang nodes
- Resilience (many Mirrors, many Brains)

---

## Components

### Node Runtime (Law)

**Location:** `src/runtime/server.ts`
**Mode:** `127.0.0.1` only (localhost)
**Responsibilities:**

- Expose proxy endpoints (`/health`, `/api/brain/chat`, `/api/agents/:id/message`, `/api/tools/execute`)
- Validate incoming requests via HMAC-SHA256 signature
- Forward authenticated requests to Brain
- Reject tool/agent calls from Brain (501/403)
- Log metadata only (no secrets, no tokens)

### Python Brain (Mind)

**Location:** `brain_api/mirror_auth.py`
**Framework:** FastAPI
**Responsibilities:**

- Expose OpenAI-compatible `/v1/chat/completions` endpoint
- Expose `/health` endpoint
- Reject tool/agent calls (501/403)
- Validate incoming HMAC signature from Node
- Replay defense via nonce cache and timestamp skew

### Signing (HMAC-SHA256)

**Canonical String:**

```
method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body_sha256
```

**Signature:**

```bash
printf %s "$CANON" | openssl dgst -sha256 -hmac "$SECRET"
```

### Replay Protection

- **Nonce Cache:** LRU with 5-minute TTL per nonce
- **Timestamp Skew:** Acceptable window ±120 seconds
- **Behavior:** Reject with HTTP 409 Conflict if nonce seen or timestamp out of range

---

## Environment Variables

| Variable                | Required              | Description                                        |
| ----------------------- | --------------------- | -------------------------------------------------- |
| `MIRROR_ENABLE_RUNTIME` | No (default: `false`) | Enable runtime server (Express)                    |
| `MIRROR_BRAIN_URL`      | Yes                   | Base URL of Brain (e.g., `http://10.0.0.23:1234`)  |
| `MIRROR_BRAIN_SECRET`   | Yes                   | Shared HMAC secret for Node → Brain authentication |
| `MIRROR_NODE_PORT`      | No (default: `3000`)  | Runtime server port                                |

---

## Endpoints

### Node Runtime

- `GET /health` — Health check (returns mode and features)
- `POST /api/brain/chat` — Proxy to Brain’s `/v1/chat/completions`
- `POST /api/agents/:id/message` — Stub (Brain rejects)
- `POST /api/tools/execute` — Stub (Brain rejects)

### Python Brain

- `GET /health` — Health check (returns mode: `inference-only`)
- `POST /v1/chat/completions` — OpenAI-compatible chat completions

---

## Request/Response Examples

### Canonical Signature Construction

```bash
TS="$(date +%s000)" NONCE="$(openssl rand -hex 32)" BODY='{"model":"test","messages":[{"role":"user","content":"Hello"}]}' BODY_SHA="$(printf %s "$BODY" | openssl dgst -sha256 | awk '{print $2}')" CANON="POST\n/api/brain/chat\n$TS\n$NONCE\n$BODY_SHA"
```

### Deterministic POST Example

```bash
curl -s -X POST http://127.0.0.1:3000/api/brain/chat \
  -H "Content-Type: application/json" \
  -H "X-Mirror-Id: mirror-runtime-v1" \
  -H "X-Mirror-Timestamp: $TS" \
  -H "X-Mirror-Nonce: $NONCE" \
  -H "X-Mirror-Signature: $SIG" \
  -d "$BODY"
```

### Replay Test Example

```bash
# First call — succeeds
curl -i -s -X POST http://127.0.0.1:3000/api/brain/chat \
  -H "Content-Type: application/json" \
  -H "X-Mirror-Id: mirror-runtime-v1" \
  -H "X-Mirror-Timestamp: $TS" \
  -H "X-Mirror-Nonce: $NONCE" \
  -H "X-Mirror-Signature: $SIG" \
  -d "$BODY"

# Second call with same nonce (within 5 min) — fails
curl -i -s -X POST http://127.0.0.1:3000/api/brain/chat \
  -H "Content-Type: application/json" \
  -H "X-Mirror-Id: mirror-runtime-v1" \
  -H "X-Mirror-Timestamp: $TS" \
  -H "X-Mirror-Nonce: $NONCE" \
  -H "X-Mirror-Signature: $SIG" \
  -d "$BODY"
```

### Expected Responses

**Node `/health`:**

```json
{
  "ok": true,
  "time": "2026-02-27T18:00:00.000Z",
  "mode": "runtime-server",
  "features": ["brain-proxy"]
}
```

**Brain `/health`:**

```json
{ "ok": true, "mode": "inference-only" }
```

**Brain chat completions (200):**

```json
{
  "id": "chatcmpl-test",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello from Brain!" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 5, "completion_tokens": 12, "total_tokens": 17 }
}
```

**Brain chat completions (replay/invalid):**

```json
{
  "error": "Replay detected or signature invalid"
}
```

---

## Threat Model

### Assumptions

- Network: LAN only (private VLAN, firewall, or trusted subnet)
- Compromise Surface: One compromised Brain does not compromise Runtime (separate processes)
- Secret Storage: `MIRROR_BRAIN_SECRET` stored on LAN nodes, never in public cloud

### Attack Vectors

| Vector            | Mitigation                                                       |
| ----------------- | ---------------------------------------------------------------- |
| Replay attack     | Nonce cache (5 min TTL) + timestamp skew (120s)                  |
| Signature forgery | HMAC-SHA256 with shared secret (256-bit entropy)                 |
| Exposed Brain     | Brain rejects `/tools`, `/agents` (501/403)                      |
| LAN sniffing      | Same as any LAN traffic — mitigated by physical network security |

### Success Criteria

- ✅ Build passes (0 errors, 0 warnings)
- ✅ Lint passes (0 errors, 0 warnings)
- ✅ Runtime server starts on 127.0.0.1 only
- ✅ Brain accepts only authenticated requests
- ✅ Brain rejects tool/agent calls
- ✅ Replay protection prevents duplicate nonce within 5 min

---

## Pond Benefit

This Two-Brain design delivers three tangible benefits for Toadgang:

1. **Local Privacy** — Inference happens on LAN, not in the public cloud. Sensitive reasoning stays within trusted network.

2. **Shared Contracts** — Multiple Mirror nodes can share the same Brain (or different Brains) without exposing inference internals. Contracts (e.g., Mirror API policy) remain centralized and governed.

3. **Resilience** — If one Brain fails, other Nodes can switch to backup Brains without system-wide outage. Many Mirrors, many Brains — distributed but aligned.

---

## Implementation Status

- **Phase 1 (LAN, v1):** ✅ Complete
  - Runtime server (Express, localhost-only)
  - Brain auth (FastAPI, HMAC, nonce cache)
  - Signature construction and validation
  - Health checks
  - Documentation

- **Phase 2 (Network, v2):** 📋 Future
  - WAN deployment (HTTPS, DNS)
  - Multiple Brain federation
  - Dynamic Brain selection
  - Auto-scaling Brain pools

---

**Version:** 1.0
**Last Updated:** 2026-02-27
**Status:** Phase 1 Complete
**Keeper:** Keeper Zero
=======
# Mirror Runtime V1 Specification

## Overview

Mirror Runtime provides LAN-safe HTTP endpoints for health checks and brain interaction.

**Purpose**: Production-grade monitoring and proxy to Brain API.

**Security**: Local state only, replay protection, input validation, LAN-safe (no network probes).

## Endpoints

### `/health`

**Purpose**: Local-only status check.

**Security**:

- No network calls
- No brain.url, no brain.status, no auth.status returned
- Only configured flags: `brain.configured`, `auth.configured`

**Response**:

```json
{
  "ok": true,
  "time": "2026-02-27T23:00:00.000Z",
  "mode": "lan",
  "version": "1.0.0",
  "commit": "abc1234",
  "features": ["brain", "auth"],
  "brain": { "configured": true },
  "auth": { "configured": true }
}
```

### `/api/brain/chat`

**Purpose**: OpenAI-compatible proxy to Brain.

**Security**:

- Deterministic HMAC-SHA256 signature from `{model, messages}`
- Nonce TTL replay protection (5s)
- Strict input validation (temperature 0-1, max_tokens 1-100000)
- 30s timeout per request
- Usage logging

**Request**:

```json
{
  "model": "gpt-4",
  "messages": [{ "role": "user", "content": "Hello" }],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

**Response** (OpenAI-compatible):

```json
{
  "id": "chat-abc1234-1234567890",
  "object": "chat.completion",
  "created": 1706390400,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello!"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

## Environment Variables

- `MIRROR_ENABLE_RUNTIME`: Enable runtime (default: "false")
- `MIRROR_RUNTIME_MODE`: "lan" or "intranet" (default: "lan")
- `MIRROR_RUNTIME_VERSION`: Version string (default: "unknown")
- `MIRROR_RUNTIME_COMMIT`: Git commit (default: "unknown")

## Brain Configuration

- `brainUrl`: Base URL for Brain API
- `authToken`: Bearer token for Brain authentication

## Replay Protection

- Nonce generated from `{model, messages}` HMAC-SHA256
- TTL: 5 seconds
- Prevents replay attacks

## Scope

**Allowed Files**:

- `src/runtime/**` (health.ts, brain-chat.ts, server.ts)
- `docs/MIRROR_RUNTIME_V1_SPEC.md` (this file)

**Forbidden**:

- Forge endpoints (`/api/forge/**`)
- Network probes in `/health`
- Wallet interactions
- Direct execution

## Integration

Runtime server starts via `startRuntimeServer(env, brainUrl, authToken)` only when `MIRROR_ENABLE_RUNTIME="true"`.

## Versioning

V1 — Initial LAN-safe runtime implementation.

**Date**: 2026-02-27
main
