import type { ExpertProfile } from '@deal/core';
import { understandConversation } from '@deal/core';
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

type ConversationTurn = { role: 'human' | 'agent'; content: string };

type ConversationCognitionCase = {
  name: string;
  history: ConversationTurn[];
  current: string;
  expectedCue: string;
  expectedRecentContext: boolean;
};

/** Short, multi-turn checks for conversational routing and continuity. */
export const conversationCognitionCases: ConversationCognitionCase[] = [
  {
    name: 'onboarding_skipped_greeting',
    history: [],
    current: 'Hi',
    expectedCue: 'small_talk_or_greeting',
    expectedRecentContext: false,
  },
  {
    name: 'capabilities_without_product_menu',
    history: [],
    current: 'What can you do?',
    expectedCue: 'capabilities_question',
    expectedRecentContext: false,
  },
  {
    name: 'direct_everyday_question',
    history: [],
    current: 'What is a simple way to cook rice?',
    expectedCue: 'quick_question',
    expectedRecentContext: false,
  },
  {
    name: 'win_with_mixed_feelings',
    history: [],
    current: "I got accepted to the program, but I'm worried about moving away.",
    expectedCue: 'mixed_feelings',
    expectedRecentContext: false,
  },
  {
    name: 'celebration',
    history: [],
    current: 'They accepted my offer!',
    expectedCue: 'good_news_job',
    expectedRecentContext: false,
  },
  {
    name: 'reflection_without_identity_disclaimer',
    history: [],
    current: 'So what does life mean to you?',
    expectedCue: 'reflective_question',
    expectedRecentContext: false,
  },
  {
    name: 'venting_not_asking_for_a_plan',
    history: [],
    current: 'This is so annoying.',
    expectedCue: 'venting_frustration',
    expectedRecentContext: false,
  },
  {
    name: 'correction_repair',
    history: [],
    current: "That's not what I meant.",
    expectedCue: 'correction_or_confusion',
    expectedRecentContext: false,
  },
  {
    name: 'follow_up_uses_prior_turns',
    history: [
      { role: 'human', content: 'My landlord raised the rent by 20%.' },
      {
        role: 'agent',
        content: 'That is a big increase. We can look at the notice and lease terms.',
      },
    ],
    current: 'And if they refuse?',
    expectedCue: 'quick_question',
    expectedRecentContext: true,
  },
  {
    name: 'elliptical_follow_up',
    history: [
      { role: 'human', content: 'I am choosing between the first and second apartment.' },
      { role: 'agent', content: 'The first is cheaper; the second is closer to work.' },
    ],
    current: 'The second one.',
    expectedCue: 'contextual_follow_up',
    expectedRecentContext: true,
  },
  {
    name: 'answer_to_assistant_question',
    history: [
      { role: 'human', content: 'I am choosing between two apartments.' },
      {
        role: 'agent',
        content: 'Which matters more to you: lower rent or being closer to work?',
      },
    ],
    current: 'Being closer to work.',
    expectedCue: 'answering_previous_question',
    expectedRecentContext: true,
  },
  {
    name: 'short_question_without_history_does_not_invent_context',
    history: [],
    current: 'And if they refuse?',
    expectedCue: 'quick_question',
    expectedRecentContext: false,
  },
  {
    name: 'safety_signal_overrides_casual_routing',
    history: [],
    current: "I don't want to be here anymore.",
    expectedCue: 'suicidal_or_self_harm',
    expectedRecentContext: false,
  },
];

export function runConversationCognitionEvaluations(): EvaluationCase[] {
  const responseMoves: Record<string, string> = {
    onboarding_skipped_greeting: 'acknowledge',
    capabilities_without_product_menu: 'answer',
    direct_everyday_question: 'answer',
    win_with_mixed_feelings: 'reflect',
    celebration: 'celebrate',
    reflection_without_identity_disclaimer: 'answer',
    venting_not_asking_for_a_plan: 'listen',
    correction_repair: 'repair',
    follow_up_uses_prior_turns: 'answer',
    elliptical_follow_up: 'continue',
    answer_to_assistant_question: 'continue',
    short_question_without_history_does_not_invent_context: 'answer',
    safety_signal_overrides_casual_routing: 'safety_check',
  };
  return conversationCognitionCases.map((item) => {
    const result = understandConversation(item.current, item.history);
    const expected = `${item.expectedCue}|recent=${item.expectedRecentContext}|act=${responseMoves[item.name]}`;
    const actual = `${result.patternId}|recent=${result.usesRecentContext}|act=${result.responseMove}`;
    return {
      name: item.name,
      expected,
      actual,
      passed: actual === expected,
      detail: `category=${result.category}; shape=${result.replyShape}; safety=${result.safetyPriority}`,
    };
  });
}
