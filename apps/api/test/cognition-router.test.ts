import { describe, expect, it } from 'vitest';
import { routeTaskCognition } from '../src/cognition-router.js';
import { professionCatalog, professionStructures } from '../src/professions.js';

describe('task cognition routing', () => {
  it('loads the twenty reviewed profession structures with unique IDs', () => {
    expect(professionStructures).toHaveLength(20);
    expect(
      new Set(professionStructures.map((profile) => profile.id)).size,
    ).toBe(20);
    expect(
      professionStructures.every((profile) => /_v1$/.test(profile.id)),
    ).toBe(true);
    expect(new Set(professionCatalog.map((profile) => profile.id)).size).toBe(
      professionCatalog.length,
    );
    expect(
      professionCatalog.find(
        (profile) => profile.id === 'health_education_assistant_v1',
      )?.title,
    ).toBe('Health Education Guide');
  });

  it.each([
    [
      'I am diabetic. Can I take sugar with tea?',
      'health_education_assistant_v1',
      'healthcare',
    ],
    [
      'Review this contract and identify the termination risk.',
      'legal_information_assistant_v1',
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
    [
      'Can I take this medication with my other medicine?',
      'pharmacist_v1',
      'healthcare',
    ],
    [
      'Fact check this article before publication.',
      'journalist_editor_v1',
      'media',
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

  it('carries the full scope contract into the selected route', () => {
    const route = routeTaskCognition({
      task: 'I am diabetic. Can I take sugar with tea?',
    });

    expect(route.requiredContext).toContain('symptoms');
    expect(route.licenseRequiredFor).toContain('diagnosis');
    expect(route.approvalActions).toContain('sensitive_health_record_write');
    expect(route.restrictedActions).toContain('prescribe');
  });
});
