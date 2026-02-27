/**
 * @fileoverview Lore Forge Runtime Hook — Optional tool-execution candidate generator
 * @description Provides a safe, gated hook that writes tool-execution artifacts to an append-only JSONL file when enabled.
 * @see docs/LORE_FORGE_RUNTIME_HOOK.md
 */

import type { ToolHandlerContext } from "../agents/pi-embedded-subscribe.handlers.types.js";
import { scoreCandidate } from "../plugin-sdk/mirror/lore_forge/scoring.js";
import { createJsonlBundle } from "../plugin-sdk/mirror/lore_forge/bundle.js";
import type { LoreCandidate } from "../plugin-sdk/mirror/lore_forge/types.js";

/**
 * Optional runtime hook for lore candidate generation.
 *
 * Behavior:
 * - Default OFF: Does nothing (no env flag)
 * - ON: Captures tool execution results, scores them, and writes to JSONL file
 * - Errors: Swallowed, logged once per failed candidate
 *
 * @param ctx - Tool execution context
 * @param toolName - Name of executed tool
 * @param toolCallId - Unique call identifier
 * @param result - Tool execution result (raw)
 */
export async function maybeForgeLoreCandidate(
  ctx: ToolHandlerContext,
  toolName: string,
  toolCallId: string,
  result: unknown,
): Promise<void> {
  // Gating: Disabled by default (MIRROR_LORE_FORGE=1)
  if (process.env.MIRROR_LORE_FORGE !== "1") {
    return;
  }

  try {
    // Create a basic candidate from tool context
    const candidate: LoreCandidate = {
      id: `${toolCallId}-${Date.now()}`,
      content: JSON.stringify({
        toolName,
        toolCallId,
        result,
        timestamp: new Date().toISOString(),
      }),
      tags: [toolName, "tool-execution"],
    };

    // Score the candidate (threshold 0.5)
    const scored = scoreCandidate(candidate, {
      minScore: 0.5,
    });

    // If score meets threshold, bundle to JSONL
    if (scored.score >= 0.5) {
      const config = {
        format: "jsonl" as const,
        outputPath: process.env.LORE_FORGE_OUT || "./.mirror/lore_forge_candidates.jsonl",
      };

      createJsonlBundle([scored.candidate], config);
    }
  } catch (error) {
    // Swallow error, log single line (never throw)
    ctx.log.warn(
      `Lore forge candidate failed: tool=${toolName} toolCallId=${toolCallId} error=${String(error)}`,
    );
  }
}
