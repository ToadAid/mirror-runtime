# Mirror Runtime Operator Status Surface

This adds a small read-only operator surface on top of the canonical Mirror runtime state.

Goals:

- expose runtime state without importing internal modules
- keep JSON payloads small and dashboard-friendly
- avoid changing runtime execution behavior
- reuse existing daemon, provider, action, and event-stream state

Endpoints:

- `GET /mirror/status`
- `GET /mirror/runtime`
- `GET /mirror/actions`
- `GET /mirror/providers`

Design notes:

- `GET /mirror/status` remains the lightweight operator health surface.
  It now includes additive runtime metadata such as version, daemon session id,
  event-stream health, action counts, provider counts, uptime, and correlation capabilities.
- `GET /mirror/runtime` exposes the canonical runtime summary for UI/operator clients.
- `GET /mirror/actions` exposes registered-action count plus currently active actions derived
  from the daemon event stream. It does not change action execution or add a second action registry.
- `GET /mirror/providers` exposes provider readiness and selected-provider state from the
  canonical provider plane.

Correlation visibility:

- runtime summaries expose capability flags for `trace_id`, `session_id`, `action_id`,
  and `provider_id`
- active action rows include `trace_id` and `session_id` when available

Non-goals:

- no execution-path refactors
- no channel migration
- no provider behavior changes
- no runtime policy or action redesign
