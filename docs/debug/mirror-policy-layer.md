# Mirror Policy Layer

`src/mirror-policy/` defines the Mirror-native policy contract and evaluation flow.

Purpose:

- give Mirror Runtime one explicit policy boundary
- attach policy at canonical runtime ingress
- keep policy separate from retrieval, provider internals, and skill logic
- create stable hook points for future law/policy enforcement

Current phase:

- defines policy context, targets, decisions, and rule evaluation
- attaches live evaluation at runtime ingress for:
  - chat
  - tools
  - provider handoff
  - runtime actions
- keeps adapters as future callers through the same contract

Current default rule:

- operator-gated tools require `MIRROR_OPERATOR_TOKEN`

Target kinds:

- `chat`
- `tool`
- `provider`
- `action`
- `adapter`

Policy phases:

- `ingress`
- `provider`
- `action`
- `adapter`

Design boundary:

- Mirror Runtime remains the canonical core
- channels and app surfaces remain adapters
- policy evaluates explicit envelopes/targets, not arbitrary internal modules
- future law/policy systems should extend `src/mirror-policy/`, not bypass it
