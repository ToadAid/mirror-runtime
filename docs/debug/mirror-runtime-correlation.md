# Mirror Runtime Correlation

Mirror Runtime now propagates correlation identifiers through the canonical runtime path so operators and UI/event consumers can trace execution end to end.

## Correlation Fields

- `trace_id`
- `session_id`
- `action_id`
- `provider_id`

## Flow

### Ingress

- service requests resolve `trace_id` from `x-mirror-trace-id` or generate one
- CLI runtime host generates a fresh `trace_id` per execution
- `session_id` comes from the existing session boundary

### Action Runtime

- action execution keeps the ingress `trace_id`
- action lifecycle owns `action_id`
- `action_id` currently matches the action execution id

### Provider Plane

- provider execution keeps the current `trace_id`
- provider selection/execution adds `provider_id`

## Event Surfaces

Correlation now appears on:

- daemon runtime events
- SSE runtime event stream
- WebSocket runtime event stream
- action lifecycle-derived runtime events
- provider selection/execution runtime events
- debug snapshots through recent runtime events

The daemon event stream hoists correlation into a stable top-level `event.correlation` object so consumers do not need to parse individual payload shapes.

## Boundary Rules

- this phase does not add a new tracing subsystem
- it builds on the existing daemon event stream
- status/debug/event consumers all see the same correlation fields
