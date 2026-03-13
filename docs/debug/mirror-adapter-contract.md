# Mirror Adapter Contract

Last updated: March 13, 2026

## Purpose

This contract defines the stable boundary between canonical Mirror Runtime and external surfaces.

External surfaces include:

- Telegram adapters
- WhatsApp/web adapters
- Discord adapters
- Slack adapters
- iMessage adapters
- Signal adapters
- web/app shells
- future custom adapters

The rule is:

adapters talk to Mirror Runtime through explicit typed envelopes

not:

adapters importing random internal runtime modules

## Contract shape

The adapter contract is implemented under:

- [src/mirror-adapters/index.ts](/home/tommy/mirror-runtime/src/mirror-adapters/index.ts)
- [src/mirror-adapters/adapter_contract.ts](/home/tommy/mirror-runtime/src/mirror-adapters/adapter_contract.ts)
- [src/mirror-adapters/adapter_bridge.ts](/home/tommy/mirror-runtime/src/mirror-adapters/adapter_bridge.ts)

## Request envelopes

Current request envelope types:

- `chat.request`
- `tool.request`

Each envelope carries:

- protocol version
- envelope id
- timestamp
- adapter descriptor
- actor identity
- session identity
- future policy/runtime/provider/action hook metadata

## Response and event envelopes

Current output envelope types:

- `chat.response`
- `tool.response`
- `runtime.event`

This keeps external surfaces on a stable contract even as internal runtime implementation changes.

## Adapter metadata

Each adapter declares:

- adapter id
- surface type
- transport name
- capabilities
- optional installation/account identifiers

This allows Mirror Runtime to understand what kind of external surface is calling it without depending on transport-specific logic.

## Actor and session handoff

The contract separates:

- actor identity
- runtime user identity
- external user identity
- session identity
- external session/thread/conversation identity

This allows adapters to preserve transport-native routing keys while Mirror Runtime preserves canonical runtime session state.

## Future hook attachment points

The contract includes explicit placeholders for later phases:

### Policy/law hook

- requested mode
- policy scope
- policy tags/facts

### Runtime hook

- priority
- trace id
- correlation id

### Provider hook

- preferred provider
- preferred model

### Action hook

- tool call id
- action group

These are declaration points only in this phase.
They do not implement the future policy or provider management layers yet.

## Current intent

This contract phase does not migrate Telegram, Discord, WhatsApp, or any other surface.

It defines the stable boundary they should use next.

Mirror Runtime remains the canonical core.
External surfaces remain adapters.
