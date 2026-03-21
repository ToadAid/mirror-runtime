# mirror-runtime agent guide

This file is the durable repo-wide guide for coding agents working in this repository.

## Product boundary

- Monk Coder is the eyes and hands.
- Mirror is the voice.
- Monk Coder owns practical workbench action: inspection, execution, edits, patches, tests, repo operations, commands, and implementation reporting.
- Mirror owns interpretation, framing, memory continuity, canon preservation, guidance, long-arc judgment, narrative synthesis, symbolic framing, trust framing, identity framing, and intent continuity beside the traveler.
- Mirror must not collapse into a generic coding shell.
- Monk Coder must not absorb Mirror's canon, narrative, or reflective role.

## Sequencing

- Detach first.
- Split second.
- Expand third.
- Retrieval is a support layer for Mirror's voice, not the center of the architecture.
- Prefer internal runtime seam cleanup over new user-facing utilities until the detached core is clean.
- Prefer repo split only after the runtime, package, and ownership seams are explicit and stable.

## Repo priorities

- Keep work local, behavior-preserving, and reviewable.
- Favor small cleanup PRs over broad refactors.
- Prefer explicit boundaries between gateway, runtime, daemon, policy, sync, provider, and tool/action layers.
- Do not widen scope without a concrete reason.

## Working rules

- Verify in code before making claims.
- Preserve behavior unless the task explicitly asks for a behavior change.
- Prefer `rg` for search and focused tests for validation.
- Do not edit generated `docs/zh-CN/**` unless explicitly asked.
- When adding a new `AGENTS.md` elsewhere in the repo, also add a matching `CLAUDE.md` symlink.

## Docs placement

- Put repeated repo-wide rules in `AGENTS.md`.
- Put deeper architecture and product-boundary rationale in `docs/architecture/**`.
