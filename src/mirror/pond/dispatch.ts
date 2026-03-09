import type { PondDispatchRequest } from "./messages.js";
import { getPondAgents } from "./registry.js";
import type { PondAgent } from "./types.js";

export function resolvePondAgent(target: string): PondAgent | null {
  const normalized = target.trim();
  if (!normalized) {
    return null;
  }

  const agents = getPondAgents();
  const resolved =
    agents.find((agent) => agent.agent_id === normalized) ??
    agents.find((agent) => agent.repo === normalized) ??
    null;

  if (resolved) {
    console.log("[POND] dispatch target resolved", normalized);
  } else {
    console.log("[POND] dispatch target missing", normalized);
  }

  return resolved;
}

export async function dispatchToPondAgent(req: PondDispatchRequest): Promise<{
  delivered: boolean;
  target: PondAgent | null;
  mode: "resolved-only";
  request: PondDispatchRequest;
}> {
  const target = resolvePondAgent(req.to);

  return {
    delivered: target !== null,
    target,
    mode: "resolved-only",
    request: req,
  };
}
