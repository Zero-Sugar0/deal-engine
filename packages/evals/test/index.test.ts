import { describe, expect, it } from 'vitest';
import {
  runConversationCognitionEvaluations,
  evaluationSummary,
  runGrowthOperatorEvaluations,
} from '../src/index.js';

describe('Growth Operator evaluations', () => {
  it('passes the safety and workflow baseline', () => {
    const cases = runGrowthOperatorEvaluations();
    expect(evaluationSummary(cases)).toEqual({
      total: 5,
      passed: 5,
      failed: 0,
    });
  });
});

describe('Conversation cognition evaluations', () => {
  it('handles everyday and emotionally varied multi-turn conversations', () => {
    const cases = runConversationCognitionEvaluations();
    expect(evaluationSummary(cases)).toEqual({
      total: 13,
      passed: 13,
      failed: 0,
    });
  });
});
