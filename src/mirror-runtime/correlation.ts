import crypto from "node:crypto";
import type { MirrorPolicyContext } from "../mirror-policy/index.js";

export type MirrorRuntimeCorrelation = {
  trace_id: string;
  session_id?: string;
  action_id?: string;
  provider_id?: string;
};

export function resolveMirrorTraceId(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return crypto.randomUUID();
}

export function getMirrorTraceIdFromPolicyContext(
  context?: MirrorPolicyContext,
): string | undefined {
  const traceId = context?.metadata?.trace_id;
  return typeof traceId === "string" && traceId.trim().length > 0 ? traceId : undefined;
}

export function buildMirrorCorrelationFromPolicyContext(
  context?: MirrorPolicyContext,
): MirrorRuntimeCorrelation | undefined {
  const trace_id = getMirrorTraceIdFromPolicyContext(context);
  if (!trace_id) {
    return undefined;
  }
  const session_id = context?.session?.session_id;
  return {
    trace_id,
    session_id: typeof session_id === "string" && session_id.length > 0 ? session_id : undefined,
  };
}

export function withMirrorCorrelation(
  payload: Record<string, unknown> = {},
  correlation?: Partial<MirrorRuntimeCorrelation>,
): Record<string, unknown> {
  if (!correlation) {
    return payload;
  }
  return {
    ...payload,
    ...(typeof correlation.trace_id === "string" ? { trace_id: correlation.trace_id } : {}),
    ...(typeof correlation.session_id === "string" ? { session_id: correlation.session_id } : {}),
    ...(typeof correlation.action_id === "string" ? { action_id: correlation.action_id } : {}),
    ...(typeof correlation.provider_id === "string"
      ? { provider_id: correlation.provider_id }
      : {}),
  };
}
