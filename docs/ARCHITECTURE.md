# Architecture (1-page)

## Goal
MirrorAI runtime = OpenClaw engine + Mirror boundary overlay.

## Layers
1. Engine (Upstream OpenClaw)
   - Core agent loop, gateway, skills, tool routing.

2. Mirror Boundary (/mirror)
   - Cadence Guard (output shaping constraints)
   - Policy & permissions (safe/elevated/dangerous)
   - Audit logging (append-only)

3. Integrations
   - Onchain reads (Base / ERC-8004 registry)
   - GitHub PR-only automation (agent0-core)
   - Future: sandbox exec (disabled by default)

## Change Policy
- Prefer configuration + overlays.
- Any engine patch must be minimal, isolated, and upstream-friendly.
