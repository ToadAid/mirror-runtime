# Mirror Action Runtime

`src/mirror-actions/` promotes Mirror execution above the current tool layer.

Purpose:

- define explicit action descriptors
- define action request/result lifecycle
- create one runtime boundary for Mirror actions
- keep policy and provider hooks first-class
- preserve the existing tool surface through a compatibility bridge

Current model:

- actions are the canonical execution unit
- existing Mirror tools are bridged into actions with `source: "tool_bridge"`
- `/mirror/tools` and CLI tool commands still work through the compatibility bridge
- policy can evaluate actions directly
- provider/runtime hooks are part of the action execution request shape

Non-goals for this phase:

- no channel migration
- no replacement of chat/provider flow with actions
- no Mirror OS work
