# Mirror Runtime WebSocket Events

Mirror Runtime now exposes runtime events over WebSocket in addition to the existing SSE surface.

## Endpoint

- WebSocket: `/mirror/runtime/ws`
- SSE: `/mirror/runtime/events`

The WebSocket surface is Mirror-native and daemon-backed. It reuses the existing mirrordaemon runtime event stream, so chat, tool, action, provider, review, sync, and runtime lifecycle events come from the same canonical source as the SSE endpoint.

## Protocol

- Protocol id: `mirror.runtime.ws.v1`
- Stream name: `runtime.events`

WebSocket messages use typed JSON envelopes instead of raw event frames so external adapters and future runtime clients can evolve against a stable contract.

## Envelope Types

- `hello`
  - sent immediately after connection
  - includes `connection_id`, `node_id`, `runtime_started_at`, and `stream`
- `subscribed`
  - confirms runtime event subscription
  - includes `backlog_sent`
- `runtime.event`
  - wraps a mirrordaemon runtime event
  - includes the full canonical runtime event payload
- `pong`
  - response to client `ping`
- `error`
  - protocol or payload error response

## Backlog and Live Delivery

By default, the server replays recent runtime events from the daemon backlog before sending live events.

Controls:

- query string: `?backlog=false`
- client message:

```json
{ "type": "subscribe", "backlog": true }
```

## Client Messages

Supported client messages:

```json
{ "type": "ping", "ts": "123" }
```

```json
{ "type": "subscribe", "backlog": true }
```

Unsupported or invalid payloads return a typed `error` envelope.

## Runtime Alignment

The WebSocket surface is additive. It does not replace SSE.

Current alignment:

- `/mirror/runtime/events`
  - SSE
  - backlog + live runtime events
- `/mirror/runtime/ws`
  - WebSocket
  - same daemon event stream, typed envelopes, adapter-friendly protocol

Both surfaces are driven by mirrordaemon so operator/debug views stay aligned with canonical runtime state.
