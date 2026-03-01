/**
 * Cadence Guard (Mirror boundary logging)
 * Library-only helpers: no runtime hooks, no behavior change unless enabled.
 */

export type ToolHandlerContext = {
  log?: {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  params?: {
    runId?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

function isEnabled(): boolean {
  // Enable with: MIRROR_BOUNDARY_LOG=1 (or "true")
  const v = process.env.MIRROR_BOUNDARY_LOG ?? "";
  return v === "1" || v.toLowerCase() === "true";
}

function safeDebug(ctx: ToolHandlerContext | undefined, msg: string): void {
  if (!ctx?.log?.debug) {
    return;
  }
  ctx.log.debug(msg);
}

/**
 * Lightweight context logger for tool boundaries.
 * Intended for debugging + observability only.
 */
export function logToolContext(
  ctx: ToolHandlerContext,
  toolName: string,
  toolCallId?: string,
): void {
  if (!isEnabled()) {
    return;
  }

  const runId = ctx?.params?.runId ?? "unknown";
  const callId = toolCallId ?? "unknown";

  safeDebug(ctx, `[MIRROR_BOUNDARY] tool=${toolName} toolCallId=${callId} runId=${runId}`);
}

/**
 * Optional validation / logging for tool results.
 * Returns void; callers keep their existing return path.
 */
export function validateToolResult(
  ctx: ToolHandlerContext,
  toolName: string,
  result: unknown,
  toolCallId?: string,
): void {
  if (!isEnabled()) {
    return;
  }

  const runId = ctx?.params?.runId ?? "unknown";
  const callId = toolCallId ?? "unknown";
  const t = result === null ? "null" : Array.isArray(result) ? "array" : typeof result;

  safeDebug(
    ctx,
    `[MIRROR_BOUNDARY] tool_result_check tool=${toolName} toolCallId=${callId} runId=${runId} result_type=${t}`,
  );
}
