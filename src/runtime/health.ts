/**
 * Compatibility shim.
 *
 * Legacy OpenClaw runtime health endpoint moved to `src/compat/openclaw/runtime/health.ts`.
 * Canonical Mirror health lives under `/mirror/health`.
 */

export { handleHealthEndpoint } from "../compat/openclaw/runtime/health.js";
