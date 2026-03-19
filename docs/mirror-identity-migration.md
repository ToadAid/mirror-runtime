Mirror Runtime — Identity Migration Plan

Overview

The repository has been renamed to Mirror Runtime, but the internal identity of the system still largely reflects its origin as OpenClaw.

This document defines the migration strategy to transition the runtime from OpenClaw → Mirror Runtime while maintaining backward compatibility for existing users, environments, and tooling.

The goal is to make Mirror Runtime the primary user-facing identity, while keeping OpenClaw only as a temporary compatibility layer.

---

Migration Principles

1. Mirror First

All user-facing output should use Mirror Runtime.

2. Backward Compatibility

Existing OPENCLAW\_\* environment variables must remain functional.

3. Non-breaking Changes

Runtime behavior must remain unchanged during migration.

4. Small, Testable Steps

Migration should occur in small PRs with full test coverage.

5. Gradual Deprecation

OpenClaw identifiers will be deprecated gradually, not removed immediately.

---

Identity Layers

The migration touches several layers of the system.

1. CLI Identity

User-facing commands and help text must identify the system as Mirror Runtime.

Examples:

Current:

OpenClaw CLI
openclaw doctor
openclaw gateway

Target:

Mirror Runtime CLI
mirror doctor
mirror gateway

OpenClaw command aliases may remain temporarily for compatibility.

---

2. Environment Variables

Current environment variables include:

OPENCLAW\_\*

Migration strategy:

Introduce new variables:

MIRROR\_\*

Maintain compatibility mapping:

OPENCLAW*\* → MIRROR*\*

Example:

OPENCLAW_CONFIG_DIR
→ MIRROR_CONFIG_DIR

Warnings may be added later for deprecated variables.

---

3. Configuration Paths

Current default paths:

~/.openclaw

Target paths:

~/.mirror

Migration plan:

1. Mirror Runtime reads both paths.

2. .mirror becomes the preferred location.

3. .openclaw remains readable for compatibility.

Example fallback order:

~/.mirror
~/.openclaw

---

4. Telemetry Namespace

Current telemetry namespace:

openclaw.\*

Target namespace:

mirror.\*

Example migration:

openclaw.gateway.requests
→ mirror.gateway.requests

During migration, dual emission may be considered to avoid breaking dashboards.

---

5. Documentation

Documentation references currently include:

docs.openclaw.ai

All documentation should transition to Mirror Runtime branding.

---

Migration Phases

Phase 1 — Identity Surface

Focus on user-visible identity.

Scope:

CLI help text

log prefixes

runtime banners

diagnostic output

Goal:

Users immediately recognize the runtime as Mirror Runtime.

---

Phase 2 — Configuration Compatibility

Introduce compatibility layer:

OPENCLAW*\* → MIRROR*\*

Add internal mapping logic while preserving existing functionality.

---

Phase 3 — Path Migration

Introduce .mirror as the default runtime directory while supporting .openclaw.

---

Phase 4 — Telemetry Namespace

Migrate metrics and traces to mirror.\*.

Compatibility with existing dashboards should be maintained where possible.

---

Out of Scope (for now)

The following changes are intentionally deferred:

Monorepo restructuring

Multi-platform build system changes

Plugin SDK redesign

Diagnostic command consolidation

These may be addressed after the identity migration is complete.

---

Success Criteria

Migration is considered complete when:

Mirror Runtime is the primary identity across CLI, logs, and diagnostics

MIRROR\_\* environment variables exist

.mirror is the primary configuration directory

telemetry namespace uses mirror.\*

OpenClaw remains only as a compatibility layer

---

Notes

This migration is primarily identity-focused, not architectural.

The underlying runtime design remains unchanged.
Mirror Runtime continues to build upon the mature infrastructure originally developed under the OpenClaw project.

---
