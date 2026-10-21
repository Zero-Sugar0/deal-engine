import { describe, expect, it } from 'vitest';
import { routeTaskCognition } from '../src/cognition-router.js';

describe('task cognition routing', () => {
  it.each([
    [
      'I am diabetic. Can I take sugar with tea?',
      'health_education_assistant_v1',
      'healthcare',
    ],
    [
      'Review this contract and identify the termination risk.',
      'attorney_legal_professional_v1',
      'legal',
    ],
    [
      'Help me debug a TypeScript API timeout.',
      'software_engineer_v1',
      'technology',
    ],
    [
      'How should I plan my monthly budget?',
      'personal_finance_organizer_v1',
      'finance',
    ],
  ])('routes %s to %s', (task, profileId, category) => {
    const route = routeTaskCognition({
      task,
      declaredProfession: 'growth_operator_v1',
    });

    expect(route.profileId).toBe(profileId);
    expect(route.category).toBe(category);
    expect(route.confidence).toBeGreaterThan(0.5);
    expect(route.retrievedPatterns.length).toBeGreaterThan(0);
  });

  it('keeps the declared identity when no specialist signal is present', () => {
    const route = routeTaskCognition({
      task: 'Help me think through this decision.',
      declaredProfession: 'growth_operator_v1',
    });

    expect(route.profileId).toBe('growth_operator_v1');
    expect(route.category).toBe('sales_marketing');
    expect(route.signals).toContain('identity:declared-profession');
  });
});
