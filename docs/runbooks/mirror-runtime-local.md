---
summary: "Run the local Telegram to MirrorDaemon to lore-aware reply stack with one startup script."
title: "Mirror Runtime Local"
---

# Mirror Runtime Local

## Prerequisites

- Node 22+ and repo dependencies installed
- A working lore directory
- A local gateway auth token in either `~/.config/systemd/user/openclaw-gateway.service` or `~/.openclaw/openclaw.json`
- Telegram already configured in OpenClaw

The startup script auto-enables the Gateway OpenAI-compatible endpoint described in [OpenAI Chat Completions](/gateway/openai-http-api).

## Startup

Optional: create a local override file from the template:

```bash
cp .env.mirror.example .env.mirror
```

Start the full local stack:

```bash
./scripts/start-mirror-local.sh
```

This starts:

- standalone MirrorDaemon on `127.0.0.1:8787`
- a local foreground-style Gateway process in the background with Mirror runtime enabled

Logs live under:

```bash
/tmp/openclaw-mirror-local
```

PID tracking lives in:

```bash
.mirror-local.pids
```

## Direct Mode

For a standalone daemon that calls the upstream model directly instead of using the Gateway bridge:

```bash
cp .env.mirror.direct.example .env.mirror.direct
```

Fill in the `MIRROR_PROVIDER_*` values, then run:

```bash
./scripts/start-mirror-direct-local.sh
```

Or:

```bash
pnpm mirror:direct
```

This keeps the existing bridge-mode startup unchanged and uses `MIRROR_PROVIDER_MODE=direct` plus the direct provider env surface as the canonical configuration.

To see per-reply retrieval diagnostics locally, enable:

```bash
export MIRROR_RETRIEVAL_DEBUG=1
```

That adds `[mirror-retrieval]` logs with selected scroll filenames, titles, and scores without logging full scroll bodies or full prompts.

## Shutdown

Stop only the processes started by the local scripts:

```bash
./scripts/stop-mirror-local.sh
```

## Verify MirrorDaemon

```bash
curl -sS http://127.0.0.1:8787/mirror/execute \
  -H 'Authorization: Bearer local-secret' \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionKey": "agent:main:telegram:direct:test",
    "agentId": "main",
    "surface": "telegram",
    "text": "hello mirror",
    "flags": { "commandAuthorized": true }
  }'
```

Expected result: JSON with a real text reply, not the stub.

## Verify Gateway Bridge

```bash
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer $(sed -n 's/^Environment=OPENCLAW_GATEWAY_TOKEN=//p' ~/.config/systemd/user/openclaw-gateway.service)" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openclaw:main",
    "messages": [{ "role": "user", "content": "hello mirror" }]
  }'
```

Expected result: an OpenAI-compatible chat completion payload.

## Telegram Test

Send a direct Telegram message such as:

```text
hello mirror
```

Expected result: a completed lore-aware Telegram reply.

## Common Failures

- Missing daemon token:
  `/mirror/execute` returns `unauthorized`. Ensure `MIRROR_DAEMON_TOKEN` and `MIRROR_RUNTIME_TOKEN` match.
- Missing brain auth token:
  the daemon reports `E_BRAIN_AUTH_TOKEN_NOT_CONFIGURED`. Ensure the gateway token can be read from the systemd service or config, or set `MIRROR_BRAIN_AUTH_TOKEN` explicitly in `.env.mirror`.
- Wrong brain URL:
  `405 Method Not Allowed` usually means `MIRROR_BRAIN_URL` is not `http://127.0.0.1:18789/v1/chat/completions`.
- Timeout too short:
  `Mirror runtime request timed out after ...` means `MIRROR_RUNTIME_TIMEOUT_MS` is too low for the current lore/model path.
- Daemon not listening on 8787:
  the gateway side shows `fetch failed`. Check `/tmp/openclaw-mirror-local/mirror-daemon.log`.
