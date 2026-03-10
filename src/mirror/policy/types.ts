export type MirrorToolRiskTier = "safe" | "elevated" | "dangerous" | "forbidden";

export type MirrorToolPolicyDecision = "allow" | "require_approval" | "deny";

export type MirrorToolPolicyInput = {
  tool_name: string;
  risk_tier?: MirrorToolRiskTier;
  caller_agent?: string;
};

export type MirrorToolPolicyResult = {
  decision: MirrorToolPolicyDecision;
  risk_tier: MirrorToolRiskTier;
  reason?: string;
};
