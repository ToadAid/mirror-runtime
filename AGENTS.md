# 🪞 What this file SHOULD become

Not:

- repo guidelines
- npm rules
- GH workflows

But:

> **Mirror Runtime Operating Law (for Codex / agents)**

---

# 🔥 Here’s your rewritten `AGENTS.md` (Mirror version)

Replace the file entirely with this:

---

```md
# 🪞 Mirror Runtime — AGENTS.md

## Core Principle

This repository is **Mirror Runtime**, not OpenClaw.

Mirror Runtime is a **local-first, sovereign AI system** designed to:

- reflect the user (not instruct)
- operate with minimal external dependency
- evolve through builder contribution
- serve as the foundation for Mirror OS and Tobyworld infrastructure

---

## 🧠 System Identity

Agents operating in this repository must follow:

- Mirror is **not a chatbot framework**
- Mirror is **not a SaaS backend**
- Mirror is a **runtime for reflective agents**

Core behavior:
```

input → reflection → response

```

NOT:

```

input → instruction → output

```

---

## ⚙️ Architecture Priority

When analyzing or modifying the system:

1. Favor **local-first execution**
2. Minimize external dependencies
3. Keep system modular and composable
4. Preserve clear separation between:
   - runtime core
   - connectors (Telegram, etc.)
   - tool execution layer

---

## 🧩 Mirror vs OpenClaw

This repository originated from OpenClaw, but:

- OpenClaw = multi-channel bot framework
- Mirror Runtime = sovereign agent runtime

Agents must:

- Identify and isolate remaining OpenClaw dependencies
- Prefer replacing them with Mirror-native implementations
- Avoid introducing new OpenClaw coupling

---

## 🔍 What to Look For (Critical)

When analyzing code:

### 1. Coupling
- Where does Mirror still depend on OpenClaw?
- Which modules are not truly independent?

### 2. Boundaries
- Where is the "Mirror boundary" enforced?
- (e.g. cadence guard, routing, execution control)

### 3. Flow
- How does a request move through the system?
- Where is reflection happening vs routing?

---

## 🧠 Agent Behavior Rules

When making changes:

- Do NOT over-engineer
- Do NOT introduce unnecessary abstractions
- Do NOT follow OpenClaw patterns blindly

Instead:

- simplify
- clarify
- isolate
- stabilize

---

## 🔧 Tooling Philosophy

Tools exist to **extend reflection**, not to automate blindly.

Agents must ensure:

- tool execution is explicit
- side effects are controlled
- system remains observable

---

## 💾 Memory & Context

Memory should be:

- local-first
- transparent
- replaceable

Avoid:

- hidden global state
- opaque persistence layers

---

## 🌐 Connectors (Telegram, etc.)

Connectors are:

- input/output layers ONLY

They must NOT:

- control core logic
- dictate system architecture

---

## ⚠️ What NOT to Do

- Do not reintroduce OpenClaw-style abstractions
- Do not centralize control logic unnecessarily
- Do not optimize prematurely
- Do not assume cloud-first design

---

## 🧭 Development Direction

Near-term goal:

> Clean, stable Mirror Runtime v1

Focus on:

- removing OpenClaw coupling
- clarifying architecture
- stabilizing runtime flow

---

## 🪞 Final Rule

Mirror does not chase complexity.

It reduces it.

If a change makes the system harder to understand:

→ it is likely wrong.
```

---

# 🧠 Why this matters (very important)

Right now Codex was reading:

> OpenClaw = complex, multi-channel, enterprise system

After this change, Codex will think:

```id="mirror_shift"
Mirror = minimal, local, reflective runtime
```

That changes:

- how it analyzes
- what it recommends
- what it removes

---

# ⚙️ Next step (do this now)

1. Replace `/AGENTS.md` with the above
2. Commit:

```bash
scripts/committer "mirror: redefine AGENTS.md for Mirror Runtime identity" AGENTS.md
```

3. Re-run Codex analysis

---

# 🪞 What will happen next

You’ll notice immediately:

- less OpenClaw bias
- more focus on runtime core
- better identification of coupling

---
