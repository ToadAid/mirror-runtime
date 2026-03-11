---
title: Mirror Runtime Forge Status Snapshot
summary: Checkpoint for the direct provider path branch as of March 11, 2026
---

# Mirror Runtime Forge Status Snapshot

Checkpoint date: March 11, 2026

Branch: `agent1/fix-20260310-080508`

Milestone commit message: `Mirror Direct Provider Path v1`

## Current architecture overview

Current request flow:

`Telegram -> OpenClaw -> MirrorDaemon -> Provider Runtime -> Model`

Current ownership at each layer:

- Telegram ingress and gateway routing remain in OpenClaw.
- MirrorDaemon owns `/mirror/execute`, request validation, lore retrieval, and provider-runtime dispatch.
- `createMirrorDaemonProviderRuntime()` selects bridge mode or direct mode from `MIRROR_PROVIDER_MODE`.
- In `bridge` mode, provider execution stays on the existing Mirror brain-chat provider bridge.
- In `direct` mode, provider execution goes straight to an OpenAI-compatible upstream endpoint.

## Features completed in this branch

- Mirror Direct Provider Path v1 is implemented.
- `MIRROR_PROVIDER_MODE` now switches provider execution between `bridge` and `direct`.
- A direct-provider client exists in `src/mirror/provider-direct.ts`.
- OpenAI-compatible transport exists in `src/mirror/provider-direct-openai.ts`.
- A daemon-boundary integration harness exists for `/mirror/execute` in direct mode.
- Operator startup path exists as `pnpm mirror:direct`.

## Files introduced or heavily modified

Primary modules:

- `src/mirror-daemon/provider-runtime.ts`
  Switches between bridge and direct execution, resolves provider config, and records invocation status/evidence.
- `src/mirror/provider-direct.ts`
  Resolves direct-provider config from env and performs direct upstream completion calls.
- `src/mirror/provider-direct-openai.ts`
  Implements the OpenAI-compatible HTTP transport.
- `src/runtime/mirror-execute.ts`
  Builds the lore-backed request and calls the provider runtime through the daemon execution path.
- `src/mirror-daemon/runtime-http-client.ts`
  Keeps the daemon/runtime HTTP boundary client in place for `/mirror/execute`.
- `scripts/start-mirror-direct-local.sh`
  Operator helper for direct-mode startup with required env validation.
- `src/mirror-daemon/direct-provider.integration.test.ts`
  Socket-gated integration harness covering daemon -> direct provider -> OpenAI-compatible stub.

Other key modules around the boundary:

- `src/runtime/mirror-provider-bridge.ts`
  Existing bridge-mode provider path retained for `MIRROR_PROVIDER_MODE=bridge`.
- `src/mirror-daemon/index.ts`
  Wires daemon startup, auth, provider runtime, and `/mirror/execute`.
- `src/runtime/server.ts`
  Builds the runtime-side provider runtime and service wiring.
- `src/mirror-daemon/runtime-http-contract.ts`
  Defines the `/mirror/execute` contract constant.
- `src/mirror-daemon/provider-runtime.test.ts`
  Covers mode selection, credential evidence, and invocation tracking.
- `src/mirror/provider-direct-openai.test.ts`
  Covers the OpenAI-compatible transport behavior.

## Runtime commands

Bridge mode:

```bash
pnpm mirror:local
```

Direct mode:

```bash
pnpm mirror:direct
```

## Environment variables used in direct mode

- `MIRROR_PROVIDER_MODE`
- `MIRROR_PROVIDER_BASE_URL`
- `MIRROR_PROVIDER_CHAT_PATH`
- `MIRROR_PROVIDER_API_KEY`
- `MIRROR_PROVIDER_MODEL`
- `MIRROR_PROVIDER_TIMEOUT_MS`

Also used by the direct startup helper:

- `MIRROR_PROVIDER_KIND` (currently expected to be `openai_compat`)
- `MIRROR_LORE_DIR`
- `MIRROR_DAEMON_TOKEN`

## Test commands

Unit tests:

```bash
pnpm test src/mirror-daemon/provider-runtime.test.ts
pnpm test src/mirror/provider-direct-openai.test.ts
```

Integration harness:

```bash
OPENCLAW_SOCKET_TESTS=1 pnpm test src/mirror-daemon/direct-provider.integration.test.ts
```

## Known limitations

- Direct mode only affects provider execution.
- Telegram ingress and gateway routing are still owned by OpenClaw.
- The daemon-boundary integration test requires a socket-enabled environment.
- The direct helper currently assumes an OpenAI-compatible upstream.
- The direct-mode path is wired at the provider boundary, not as a full ingress detachment.

## Next recommended tasks

- Clean up and consolidate docs so the old and new runtime status notes do not drift.
- Consolidate configuration surfaces for bridge and direct mode.
- Run a real-model smoke test in direct mode against a live upstream.
- Plan the next phase for ingress detachment if Mirror is meant to move beyond provider-only direct mode.

## Resume notes

If work resumes tomorrow, start from these checkpoints:

1. Confirm which mode is intended: `bridge` or `direct`.
2. For direct mode, verify `.env.mirror.direct` or shell env contains the provider base URL, API key, model, and timeout.
3. Run the two unit tests first, then the socket-gated integration harness if the environment supports it.
4. If behavior differs from expectation, inspect `src/mirror-daemon/provider-runtime.ts`, `src/mirror/provider-direct.ts`, and `src/mirror-daemon/direct-provider.integration.test.ts` first.
