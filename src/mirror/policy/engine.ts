import type {
  MirrorToolPolicyDecision,
  MirrorToolPolicyInput,
  MirrorToolPolicyResult,
  MirrorToolRiskTier,
} from "./types.js";

const NORMALIZED_TOOL_RULES: Record<string, { risk: MirrorToolRiskTier }> = {
  exec: { risk: "dangerous" },
  "fs.write": { risk: "elevated" },
  write: { risk: "elevated" },
  "fs.edit": { risk: "elevated" },
  edit: { risk: "elevated" },
  apply_patch: { risk: "dangerous" },
  "git.mutate": { risk: "dangerous" },
  git: { risk: "dangerous" },
  "git.pr": { risk: "elevated" },
  // v0 concrete deny rule: on-chain write actions are out of scope for monk-coder runtime.
  "onchain.write": { risk: "forbidden" },
  "onchain.read": { risk: "safe" },
  "mirror.chain.token_balance": { risk: "safe" },
  "mirror.chain.token_state": { risk: "safe" },
  "mirror.chain.wallet_profile": { risk: "safe" },
};

const RISK_DECISIONS: Record<
  MirrorToolRiskTier,
  { decision: MirrorToolPolicyDecision; reason: string }
> = {
  safe: { decision: "allow", reason: "safe tool class" },
  elevated: { decision: "require_approval", reason: "elevated tool class requires approval" },
  dangerous: { decision: "require_approval", reason: "dangerous tool class requires approval" },
  forbidden: { decision: "deny", reason: "forbidden tool class is denied" },
};

export function normalizePolicyToolName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized === "patch") {
    return "apply_patch";
  }
  if (normalized.startsWith("git_")) {
    return "git.mutate";
  }
  if (normalized.startsWith("git.")) {
    return normalized;
  }
  if (normalized === "read") {
    return "fs.read";
  }
  if (normalized === "write") {
    return "fs.write";
  }
  return normalized;
}

export function inferPolicyRiskTier(toolName: string): MirrorToolRiskTier {
  const normalized = normalizePolicyToolName(toolName);
  const direct = NORMALIZED_TOOL_RULES[normalized];
  if (direct) {
    return direct.risk;
  }
  if (normalized.startsWith("git")) {
    return "dangerous";
  }
  if (normalized.includes("onchain") && normalized.includes("read")) {
    return "safe";
  }
  if (normalized.includes("write") || normalized.includes("edit")) {
    return "elevated";
  }
  return "safe";
}

export function evaluateToolPolicy(input: MirrorToolPolicyInput): MirrorToolPolicyResult {
  const toolName = normalizePolicyToolName(input.tool_name || "");
  const riskTier = input.risk_tier ?? inferPolicyRiskTier(toolName);
  const policy = RISK_DECISIONS[riskTier];
  const caller = input.caller_agent?.trim();
  const callerNote = caller ? `; caller_agent=${caller}` : "";
  return {
    decision: policy.decision,
    risk_tier: riskTier,
    reason: `${policy.reason}; tool=${toolName}${callerNote}`,
  };
}
