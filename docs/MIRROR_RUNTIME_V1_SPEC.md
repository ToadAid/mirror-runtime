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
