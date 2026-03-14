import { authorizeMirrorToolAccess } from "../mirror-gateway/auth.js";
import type { MirrorPolicyDecision, MirrorPolicyRule } from "./policy_types.js";

function denyDecision(params: {
  code: string;
  reason: string;
  statusCode?: number;
  rule: string;
  tags?: string[];
}): MirrorPolicyDecision {
  return {
    allowed: false,
    code: params.code,
    reason: params.reason,
    statusCode: params.statusCode,
    rule: params.rule,
    tags: params.tags,
  };
}

export function createMirrorOperatorAccessPolicyRule(): MirrorPolicyRule {
  return {
    name: "mirror.operator-access",
    evaluate(input) {
      if (input.target.kind !== "tool" && input.target.kind !== "action") {
        return null;
      }

      const decision = authorizeMirrorToolAccess(
        input.target.access ?? "open",
        input.context.request_token ?? null,
      );
      if (decision.allowed) {
        return null;
      }

      return denyDecision({
        code: decision.statusCode === 503 ? "operator_auth_unconfigured" : "operator_auth_required",
        reason: decision.error ?? "Mirror operator authorization required",
        statusCode: decision.statusCode,
        rule: "mirror.operator-access",
        tags: ["tool", "operator"],
      });
    },
  };
}

export function createDefaultMirrorPolicyRules(): MirrorPolicyRule[] {
  return [createMirrorOperatorAccessPolicyRule()];
}
