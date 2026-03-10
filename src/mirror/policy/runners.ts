import { evaluateToolPolicy, inferPolicyRiskTier } from "./engine.js";
import type { MirrorToolPolicyResult } from "./types.js";

export function evaluateMirrorToolRunnerPolicy(params: {
  toolName: string;
  callerAgent?: string;
}): MirrorToolPolicyResult {
  return evaluateToolPolicy({
    tool_name: params.toolName,
    risk_tier: inferPolicyRiskTier(params.toolName),
    caller_agent: params.callerAgent,
  });
}

export function evaluateMirrorForgeToolRunnerPolicy(params: {
  toolName: string;
  callerAgent?: string;
}): MirrorToolPolicyResult {
  return evaluateToolPolicy({
    tool_name: params.toolName,
    risk_tier: inferPolicyRiskTier(params.toolName),
    caller_agent: params.callerAgent,
  });
}
