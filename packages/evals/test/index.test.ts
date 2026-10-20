import { describe, expect, it } from 'vitest';
import {
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
