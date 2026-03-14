import crypto from "node:crypto";
import type { MirrorPolicyContext } from "../mirror-policy/index.js";

export type MirrorRuntimeCorrelation = {
  trace_id: string;
  session_id?: string;
  action_id?: string;
  provider_id?: string;
};

export function normalizeMirrorCorrelation(
  correlation?: Partial<MirrorRuntimeCorrelation>,
): Partial<MirrorRuntimeCorrelation> | undefined {
  if (!correlation) {
    return undefined;
  }
  const normalized = {
    ...(typeof correlation.trace_id === "string" && correlation.trace_id.trim().length > 0
      ? { trace_id: correlation.trace_id.trim() }
      : {}),
    ...(typeof correlation.session_id === "string" && correlation.session_id.trim().length > 0
      ? { session_id: correlation.session_id.trim() }
      : {}),
    ...(typeof correlation.action_id === "string" && correlation.action_id.trim().length > 0
      ? { action_id: correlation.action_id.trim() }
      : {}),
    ...(typeof correlation.provider_id === "string" && correlation.provider_id.trim().length > 0
      ? { provider_id: correlation.provider_id.trim() }
      : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function mergeMirrorCorrelation(
  ...sources: Array<Partial<MirrorRuntimeCorrelation> | undefined>
): Partial<MirrorRuntimeCorrelation> | undefined {
  const merged: Partial<MirrorRuntimeCorrelation> = {};
  for (const source of sources) {
    const normalized = normalizeMirrorCorrelation(source);
    if (!normalized) {
      continue;
    }
    Object.assign(merged, normalized);
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

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
  const normalized = normalizeMirrorCorrelation(correlation);
  if (!normalized) {
    return payload;
  }
  return {
    ...payload,
    ...normalized,
  };
}
