# Mirror UI API Contract

Mirror Runtime now exposes a thin UI-facing API surface for external pages and adapters that need runtime data without importing internal modules.

## Goals

- keep Mirror Runtime as the canonical core
- give Forge pages, Agent pages, and future Pond UI a stable REST boundary
- expose runtime discovery instead of internal module wiring
- preserve existing runtime, gateway, console, and event layers

## Base Surface

All endpoints live under:

- `/mirror/ui`

All responses use the same envelope shape:

```json
{
  "ok": true,
  "api": "mirror.ui.v1",
  "kind": "runtime.status",
  "data": {}
}
```

## Endpoints

### `GET /mirror/ui`

Discovery document for UI clients.

Returns URLs for:

- Forge identity
- agent directory
- runtime status
- runtime event discovery

### `GET /mirror/ui/forge/identity`

Forge identity flow entrypoint.

Returns:

- Mirror passport
- local runtime identity
- operator-auth visibility

### `GET /mirror/ui/agents`

Agent directory query surface.

Current scope in this phase:

- local runtime agent listing only
- one stable entry derived from passport + runtime state

This keeps the contract stable without introducing a new cross-agent directory system yet.

### `GET /mirror/ui/runtime/status`

Returns:

- runtime summary
- health summary

This is the UI-safe runtime status surface.

### `GET /mirror/ui/runtime/events`

Runtime event discovery document.

Returns discovery info for:

- SSE: `/mirror/runtime/events`
- WebSocket: `/mirror/runtime/ws`

Includes:

- stream name
- WebSocket protocol id
- client/server message types
- backlog behavior hints

## Boundary Rules

- UI clients talk to `/mirror/ui/*`
- UI clients do not import internal runtime modules
- adapters and future UI surfaces can use these same envelopes
- this layer stays thin and wraps existing runtime truth only

## Future Hooks

This contract leaves room for future additions without breaking the shape:

- policy/law visibility
- action catalog discovery
- provider state discovery
- richer multi-agent directory results
- adapter/channel surface metadata
