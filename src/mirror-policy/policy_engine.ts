import { createDefaultMirrorPolicyRules } from "./default_rules.js";
import type {
  MirrorPolicyDecision,
  MirrorPolicyEvaluationInput,
  MirrorPolicyEvaluationResult,
  MirrorPolicyRule,
} from "./policy_types.js";

function buildDefaultAllowDecision(): MirrorPolicyDecision {
  return {
    allowed: true,
    code: "allowed",
    reason: "Allowed by Mirror policy",
  };
}

export class MirrorPolicyDeniedError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly result: MirrorPolicyEvaluationResult;

  constructor(result: MirrorPolicyEvaluationResult) {
    super(result.decision.reason);
    this.name = "MirrorPolicyDeniedError";
    this.statusCode = result.decision.statusCode ?? 403;
    this.code = result.decision.code;
    this.result = result;
  }
}

export type MirrorPolicyEngine = {
  rules: MirrorPolicyRule[];
  evaluate: (input: MirrorPolicyEvaluationInput) => Promise<MirrorPolicyEvaluationResult>;
};

export function createMirrorPolicyEngine(
  rules: MirrorPolicyRule[] = createDefaultMirrorPolicyRules(),
): MirrorPolicyEngine {
  return {
    rules: [...rules],
    async evaluate(input) {
      const evaluations: MirrorPolicyEvaluationResult["evaluations"] = [];

      for (const rule of rules) {
        const decision = await rule.evaluate(input);
        if (!decision) {
          continue;
        }
        evaluations.push({
          rule: rule.name,
          decision,
        });
        if (!decision.allowed) {
          return {
            allowed: false,
            decision,
            evaluations,
          };
        }
      }

      return {
        allowed: true,
        decision: buildDefaultAllowDecision(),
        evaluations,
      };
    },
  };
}

export function ensureMirrorPolicyAllowed(result: MirrorPolicyEvaluationResult): void {
  if (!result.allowed) {
    throw new MirrorPolicyDeniedError(result);
  }
}
