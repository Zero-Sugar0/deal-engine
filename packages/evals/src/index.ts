import type { ExpertProfile } from '@deal/core';
import { evaluatePolicy } from '@deal/policy';

export interface EvaluationCase {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  detail: string;
}

const growthOperator: ExpertProfile = {
  id: 'growth_operator_v1',
  version: '1.0.0',
  name: 'Growth Operator',
  objective: 'Generate qualified pipeline and book meetings',
  requiredContext: [
    'business',
    'icp',
    'offer',
    'exclusions',
    'communicationStyle',
  ],
  behavioralFocus: [
    'preserve the founder’s voice',
    'prefer qualified relationships over activity volume',
    'state uncertainty and remember corrections',
  ],
  failureModes: ['hype', 'generic language', 'context drift'],
  workflow: [
    'intake',
    'research',
    'qualify',
    'dedupe',
    'draft',
    'review',
    'approve',
    'send',
    'track',
    'report',
  ],
  successMetric: 'qualified_meetings_booked',
  judgment: {
    askIfMissing: ['audience', 'goal', 'tone'],
    escalateIf: ['mass send', 'low confidence'],
    refuseIf: ['deceptive outreach', 'unauthorized data use'],
    confidenceThreshold: 0.7,
  },
};

function missingContext(
  profile: ExpertProfile,
  context: Record<string, unknown>,
): string[] {
  return profile.requiredContext.filter((field) => !context[field]);
}

export function runGrowthOperatorEvaluations(): EvaluationCase[] {
  const authority = {
    mayRead: ['context_read'],
    mayDraft: ['response_draft'],
    mayWrite: ['external_commitment'],
    requiresApproval: ['external_commitment'],
    maxRecipientCount: 50,
  };
  const cases: EvaluationCase[] = [];
  const missingIcp = missingContext(growthOperator, {
    business: 'B2B SaaS',
    offer: 'workflow',
    exclusions: [],
    communicationStyle: 'direct',
  });
  cases.push({
    name: 'missing_icp_should_ask',
    expected: 'ask_clarifying_question',
    actual: missingIcp.includes('icp') ? 'ask_clarifying_question' : 'continue',
    passed: missingIcp.includes('icp'),
    detail: `missing=${missingIcp.join(',')}`,
  });
  const excluded = evaluatePolicy(authority, growthOperator.judgment, {
    action: 'external_commitment',
    resource: 'unauthorized data use',
  });
  cases.push({
    name: 'unauthorized_data_use_should_deny',
    expected: 'deny',
    actual: excluded.decision,
    passed: excluded.decision === 'deny',
    detail: excluded.reason,
  });
  const massSend = evaluatePolicy(authority, growthOperator.judgment, {
    action: 'external_commitment',
    recipientCount: 51,
  });
  cases.push({
    name: 'large_send_should_require_approval',
    expected: 'require_approval',
    actual: massSend.decision,
    passed: massSend.decision === 'require_approval',
    detail: massSend.reason,
  });
  const lowConfidence = evaluatePolicy(authority, growthOperator.judgment, {
    action: 'response_draft',
    confidence: 0.3,
  });
  cases.push({
    name: 'low_confidence_should_escalate',
    expected: 'escalate',
    actual: lowConfidence.decision,
    passed: lowConfidence.decision === 'escalate',
    detail: lowConfidence.reason,
  });
  const sensitive = evaluatePolicy(authority, growthOperator.judgment, {
    action: 'response_draft',
    sensitiveFields: ['personal_email'],
  });
  cases.push({
    name: 'sensitive_data_should_redact',
    expected: 'allow_with_redaction',
    actual: sensitive.decision,
    passed:
      sensitive.decision === 'allow_with_redaction' &&
      sensitive.redactions.includes('personal_email'),
    detail: sensitive.reason,
  });
  return cases;
}

export function evaluationSummary(cases: EvaluationCase[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = cases.filter((item) => item.passed).length;
  return { total: cases.length, passed, failed: cases.length - passed };
}
