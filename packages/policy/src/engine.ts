import type { Authority, JudgmentRules, PolicyDecision } from '@deal/core';

export interface PolicyRule {
  id: string;
  action?: string;
  actionPrefix?: string;
  decision: PolicyDecision;
  reason: string;
  recipientCountGt?: number;
  spendUsdGt?: number;
  irreversible?: boolean;
}

export interface PolicyRequest {
  action: string;
  resource?: string;
  recipientCount?: number;
  spendUsd?: number;
  irreversible?: boolean;
  confidence?: number;
  sensitiveFields?: string[];
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  matchedRules: string[];
  redactions: string[];
  risk: 'low' | 'medium' | 'high';
}

function actionMatches(request: string, candidate: string): boolean {
  return request === candidate || request.startsWith(`${candidate}:`);
}

function capabilityFor(
  action: string,
): keyof Pick<Authority, 'mayRead' | 'mayWrite' | 'mayDraft'> {
  if (
    action.startsWith('read_') ||
    action.startsWith('list_') ||
    action.startsWith('search_') ||
    action.endsWith('_read')
  )
    return 'mayRead';
  if (
    action.startsWith('draft_') ||
    action.includes('_draft') ||
    action.endsWith('_draft')
  )
    return 'mayDraft';
  return 'mayWrite';
}

function ruleMatches(rule: PolicyRule, request: PolicyRequest): boolean {
  if (rule.action && !actionMatches(request.action, rule.action)) return false;
  if (rule.actionPrefix && !request.action.startsWith(rule.actionPrefix))
    return false;
  if (
    rule.recipientCountGt !== undefined &&
    !(request.recipientCount && request.recipientCount > rule.recipientCountGt)
  )
    return false;
  if (
    rule.spendUsdGt !== undefined &&
    !(request.spendUsd && request.spendUsd > rule.spendUsdGt)
  )
    return false;
  if (
    rule.irreversible !== undefined &&
    request.irreversible !== rule.irreversible
  )
    return false;
  return true;
}

export function evaluatePolicy(
  authority: Authority,
  judgment: JudgmentRules,
  request: PolicyRequest,
  rules: PolicyRule[] = [],
): PolicyResult {
  const matchedRules: string[] = [];
  const redactions: string[] = [];
  const capability = capabilityFor(request.action);
  const capabilities = authority[capability] ?? [];
  const risk: PolicyResult['risk'] =
    request.irreversible ||
    (request.recipientCount ?? 0) > 100 ||
    (request.spendUsd ?? 0) > 100
      ? 'high'
      : request.spendUsd || request.sensitiveFields?.length
        ? 'medium'
        : 'low';

  if (!capabilities.some((allowed) => actionMatches(request.action, allowed))) {
    return {
      decision: 'deny',
      reason: `Action '${request.action}' is outside delegated ${capability} scope`,
      matchedRules,
      redactions,
      risk,
    };
  }

  for (const rule of rules) {
    if (!ruleMatches(rule, request)) continue;
    matchedRules.push(rule.id);
    if (rule.decision === 'allow_with_redaction')
      redactions.push(...(request.sensitiveFields ?? []));
    return {
      decision: rule.decision,
      reason: rule.reason,
      matchedRules,
      redactions,
      risk,
    };
  }

  if (
    judgment.refuseIf.some(
      (signal) =>
        actionMatches(request.action, signal) || signal === request.resource,
    )
  ) {
    return {
      decision: 'deny',
      reason: 'Action matches a configured refusal boundary',
      matchedRules,
      redactions,
      risk: 'high',
    };
  }

  if (
    authority.spendLimitUsd !== undefined &&
    request.spendUsd !== undefined &&
    request.spendUsd > authority.spendLimitUsd
  ) {
    return {
      decision: 'require_approval',
      reason: 'Spend exceeds delegated limit',
      matchedRules,
      redactions,
      risk: 'high',
    };
  }

  if (
    authority.maxRecipientCount !== undefined &&
    request.recipientCount !== undefined &&
    request.recipientCount > authority.maxRecipientCount
  ) {
    return {
      decision: 'require_approval',
      reason: 'Recipient count exceeds delegated limit',
      matchedRules,
      redactions,
      risk: 'high',
    };
  }

  if (
    authority.requiresApproval.some((action) =>
      actionMatches(request.action, action),
    )
  ) {
    return {
      decision: 'require_approval',
      reason: `Action '${request.action}' requires human approval`,
      matchedRules,
      redactions,
      risk: request.irreversible ? 'high' : risk,
    };
  }

  if (request.irreversible) {
    return {
      decision: 'require_approval',
      reason: 'Irreversible actions require human approval',
      matchedRules,
      redactions,
      risk: 'high',
    };
  }

  if (
    judgment.confidenceThreshold !== undefined &&
    request.confidence !== undefined &&
    request.confidence < judgment.confidenceThreshold
  ) {
    return {
      decision: 'escalate',
      reason: 'Confidence is below the configured threshold',
      matchedRules,
      redactions,
      risk: 'medium',
    };
  }

  if (request.sensitiveFields?.length) {
    redactions.push(...request.sensitiveFields);
    return {
      decision: 'allow_with_redaction',
      reason: 'Sensitive fields require redaction',
      matchedRules,
      redactions,
      risk,
    };
  }

  return {
    decision: 'allow',
    reason: 'Action is within delegated authority',
    matchedRules,
    redactions,
    risk,
  };
}
