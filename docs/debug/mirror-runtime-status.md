---
title: Mirror Runtime Status
summary: Current Mirror runtime backend integration status and next steps
---

# Mirror Runtime Status

## Verified working

As of March 11, 2026, the non-live Mirror runtime loop is wired and the standalone daemon route responds correctly when called with the daemon token.

Verified command:

```bash
export MIRROR_POND_SIGNING_PRIVATE_KEY_PATH=/tmp/mirror-daemon-signing-key.pem
export MIRROR_DAEMON_TOKEN=local-secret

node --import tsx -e 'import { startMirrorDaemon } from "./src/mirror-daemon/index.ts"; const s = await startMirrorDaemon({ host: "127.0.0.1", port: 8787 }); console.log("started", s.url); await new Promise(() => {});'
```

Verified request:

```bash
curl -i -X POST http://127.0.0.1:8787/mirror/execute \
  -H 'Authorization: Bearer local-secret' \
  -H 'Content-Type: application/json' \
  -d '{"sessionKey":"agent:main:test:1","agentId":"main","surface":"telegram","text":"hello","flags":{"commandAuthorized":true}}'
```

Verified response:

```json
{ "text": "[mirror-runtime stub response]" }
```

## Current state

The following pieces are now in place:

- `ReplyBackend` seam at shared dispatch
- `MirrorDaemonReplyRequest` projection helper
- `MirrorDaemonReplyBackend`
- `MirrorRuntimeClient` and `HttpMirrorRuntimeClient`
- `/mirror/execute` server-side contract and stub handler
- `MIRROR_RUNTIME_ENABLED=1` backend-selection seam
- Telegram path now respects the shared backend selector

## Remaining gap

Telegram/OpenClaw currently targets the gateway-local runtime client URL by default:

```text
http://127.0.0.1:18789/mirror/execute
```

The standalone daemon is running separately at:

```text
http://127.0.0.1:8787/mirror/execute
```

and requires:

```text
Authorization: Bearer local-secret
```

So the remaining integration gap is configuration, not routing:

- point `HttpMirrorRuntimeClient` at the standalone daemon with `MIRROR_RUNTIME_BASE_URL`
- pass the daemon bearer token from the runtime client

## Next safe step

Add authenticated standalone-daemon support to `HttpMirrorRuntimeClient` selection/configuration:

- `MIRROR_RUNTIME_BASE_URL=http://127.0.0.1:8787`
- runtime client auth token sourced from Mirror daemon config/env

Then verify the full Telegram path returns:

```text
[mirror-runtime stub response]
```

## Notes

- Standalone `tsx` startup was previously blocked by the `__name is not a function` logger crash in `createSubsystemLogger()`. That path is now fixed.
- `/mirror/execute` is protected when `MIRROR_DAEMON_TOKEN` is set. `401 unauthorized` without the bearer token is expected.
