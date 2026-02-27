/**
 * Mirror Cadence Guard — Output Shaping Overlay
 *
 * This module provides a feature-flagged boundary layer for MirrorAI runtime.
 * When enabled, it performs logging and annotation of tool results.
 * When disabled, it is a no-op pass-through.
 *
 * @module mirror/cadence_guard
 */

import type { ToolHandlerContext } from "../src/agents/pi-embedded-subscribe.handlers.types.js";

/**
 * Cross-runtime environment getter.
 * Safely retrieves environment variables in both Deno and Node.js.
 */
const envGet = (k: string): string | undefined => {
  // Deno environment
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as unknown as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno
      ?.env?.get
  ) {
    return (
      globalThis as unknown as { Deno: { env: { get: (key: string) => string | undefined } } }
    ).Deno.env.get(k);
  }
  // Node.js environment
  return process.env[k];
};

/**
 * MIRROR_BOUNDARY environment variable.
 *
 * - "0" or undefined → boundary disabled (default)
 * - "1" → boundary enabled (logs only, no output edits)
 *
 * @see https://github.com/ToadAid/mirror-runtime/blob/main/docs/ARCHITECTURE.md
 */
export const MIRROR_BOUNDARY_ENABLED = envGet("MIRROR_BOUNDARY") === "1";

/**
 * Checks if the boundary is enabled.
 */
export function isEnabled(): boolean {
  return MIRROR_BOUNDARY_ENABLED;
}

/**
 * Checks if the boundary is disabled (pass-through mode).
 */
export function isDisabled(): boolean {
  return !MIRROR_BOUNDARY_ENABLED;
}

/**
 * Logs tool execution context when boundary is enabled.
 *
 * This function does NOT modify any state or output.
 * It only emits structured logs for audit purposes.
 */
export function logToolContext(
  ctx: ToolHandlerContext,
  toolName: string,
  toolCallId: string,
): void {
  if (!isEnabled()) {
    return;
  }

  ctx.log.info(
    `MIRROR_BOUNDARY: tool=${toolName} toolCallId=${toolCallId} runId=${ctx.params.runId}`,
  );
}

/**
 * Validates tool result before committing to messaging tool texts.
 *
 * When enabled, this function logs the result for audit purposes.
 * It does NOT reject or modify the result.
 */
export function validateToolResult(
  ctx: ToolHandlerContext,
  toolName: string,
  result: unknown,
): void {
  if (!isEnabled()) {
    return;
  }

  ctx.log.debug(`MIRROR_BOUNDARY: tool_result_check tool=${toolName} result_type=${typeof result}`);
}
