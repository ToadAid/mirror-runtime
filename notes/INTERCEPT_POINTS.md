# Candidate Interception Points (No Code Yet)

Goal: identify where to hook a Mirror output boundary without mutating upstream behavior.

## What we need
- A single place where model output is finalized before being emitted to UI/clients.
- Ability to apply a guard (Cadence/Policy) under a feature flag.

## Candidates to inspect (starting points)
- Agent loop / response assembly
- Tool execution pipeline (message tool)
- Gateway emit / websocket send layer

## Rules
- Document-only in PR#1.
- No code hooks until PR#2.
- Prefer hook via adapter layer or plugin boundary if available.
