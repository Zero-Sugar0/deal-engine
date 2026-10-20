import type { Authority, JudgmentRules } from "@deal/core";

export interface PolicyRequest {
  action: string;
  recipientCount?: number;
  spendUsd?: number;
  irreversible?: boolean;
  confidence?: number;
}

export interface PolicyResult {
  decision: "allow" | "require_approval" | "escalate" | "deny";
  reason: string;
}

export function evaluatePolicy(
  authority: Authority,
  judgment: JudgmentRules,
  request: PolicyRequest
): PolicyResult {
  if (request.spendUsd && authority.spendLimitUsd && request.spendUsd > authority.spendLimitUsd) {
    return {
      decision: "require_approval",
      reason: "Spend exceeds delegated limit"
    };
  }

  if (
    authority.requiresApproval?.includes(request.action)
  ) {
    return {
      decision: "require_approval",
      reason: `Action '${request.action}' requires human approval`
    };
  }

  if (
    judgment.confidenceThreshold &&
    request.confidence !== undefined &&
    request.confidence < judgment.confidenceThreshold
  ) {
    return {
      decision: "escalate",
      reason: "Confidence below threshold"
    };
  }

  return {
    decision: "allow",
    reason: "Action is within delegated authority"
  };
}
