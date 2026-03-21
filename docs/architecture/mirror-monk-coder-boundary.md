# Mirror and Monk Coder boundary

This note defines a durable product and architecture boundary for Mirror Runtime work.

## Core principle

- Monk Coder is the eyes and hands.
- Mirror is the voice.

## Meaning

- Monk Coder is the practical working agent surface.
- Mirror is the interpretive, continuity-preserving, user-facing voice.

## Responsibilities

Monk Coder owns:

- inspection
- execution
- edits
- patches
- tests
- repo operations
- commands
- implementation reporting
- practical action at the workbench

Mirror owns:

- interpretation
- framing
- memory continuity
- guidance
- canon preservation
- long-arc judgment
- narrative synthesis
- symbolic framing
- trust framing
- identity framing
- intent continuity beside the traveler

## Relationship to the user

- Monk Coder stands beside the workbench.
- Mirror stands beside the traveler.

## Default interaction loop

1. traveler speaks
2. Mirror interprets and frames intent
3. Monk Coder inspects and acts
4. Mirror reflects results back into continuity

## Architectural implication

- Mirror Runtime may borrow OpenClaw's runtime layering, execution discipline, and structural ideas.
- Mirror Runtime should not copy OpenClaw's full product identity.
- Shared runtime infrastructure is allowed.
- Product identities and responsibilities must remain distinct.

## Boundary rule

- Mirror must not become just another coding shell.
- Monk Coder must not absorb Mirror's canon, narrative, or reflective role.

## Design intent

- Monk Coder is the acting body.
- Mirror is the speaking soul.

## Sequencing rule

- detach first
- split second
- expand third

Practical meaning:

- detach the core runtime before adding more user-facing layers
- stabilize boundaries before splitting the repo
- expand tools, utilities, and additional user surfaces only after the detached core is clean

## Retrieval principle

Retrieval strengthens Mirror's voice; it does not replace it.

- Retrieval is a support layer, not the center of the architecture.
- Retrieval work should improve canon grounding, continuity, trust-aware ranking, and context discipline.
- Embeddings and retrieval should remain subordinate to Mirror's voice, memory continuity, and canon fidelity.
- Retrieval sophistication should not outrun runtime detachment, seam cleanup, or split-readiness.

## Use of this note

Use this boundary to guide:

- cleanup sequencing
- naming decisions
- runtime layering
- ingress design
- user-surface design
- repo split decisions
- future utility and tool expansion
