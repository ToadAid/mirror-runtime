ctx.log.debug(
    MIRROR_BOUNDARY: tool=${toolName} toolCallId=${toolCallId} runId=${ctx.params.runId},
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

  ctx.log.debug(
    MIRROR_BOUNDARY: tool_result_check tool=${toolName} result_type=${typeof result},
  );
}