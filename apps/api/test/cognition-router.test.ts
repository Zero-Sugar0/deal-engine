import { IdentityProfileSchema } from '@deal/core';
import { describe, expect, it } from 'vitest';
import { routeTaskCognition } from '../src/cognition-router.js';
import {
  cognitiveEngineerStructure,
  humanContextStructures,
  lifeContextStructures,
  professionCatalog,
  professionExpansionStructures,
  professionStructures,
} from '../src/professions.js';

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

  it('loads the fifty expansion structures with complete scope contracts', () => {
    expect(professionExpansionStructures).toHaveLength(50);
    expect(
      new Set(professionExpansionStructures.map((profile) => profile.id)).size,
    ).toBe(50);
    const originalIds = new Set(
      professionStructures.map((profile) => profile.id),
    );
    expect(
      professionExpansionStructures.every(
        (profile) => !originalIds.has(profile.id),
      ),
    ).toBe(true);
    expect(
      professionExpansionStructures.every((profile) => /_v1$/.test(profile.id)),
    ).toBe(true);
    expect(
      professionExpansionStructures.every(
        (profile) =>
          profile.summary.length > 0 &&
          profile.objective.length > 0 &&
          profile.requiredContext.length > 0 &&
          profile.safetyBoundaries.length > 0,
      ),
    ).toBe(true);
    expect(professionCatalog).toHaveLength(
      professionCatalog.filter(
        (profile, index, profiles) =>
          profiles.findIndex((candidate) => candidate.id === profile.id) ===
          index,
      ).length,
    );
    expect(cognitiveEngineerStructure.routingPriority).toBeGreaterThan(0);
  });

  it('loads thirty life contexts with explicit subject types', () => {
    expect(lifeContextStructures).toHaveLength(30);
    expect(
      new Set(lifeContextStructures.map((profile) => profile.id)).size,
    ).toBe(30);
    expect(
      lifeContextStructures.every(
        (profile) =>
          profile.subjectType !== 'profession' &&
          profile.summary.length > 0 &&
          profile.objective.length > 0 &&
          profile.requiredContext.length > 0 &&
          profile.safetyBoundaries.length > 0,
      ),
    ).toBe(true);
  });

  it('loads thirty human contexts with explicit subject types', () => {
    expect(humanContextStructures).toHaveLength(30);
    expect(
      new Set(humanContextStructures.map((profile) => profile.id)).size,
    ).toBe(30);
    expect(
      humanContextStructures.every(
        (profile) =>
          profile.subjectType !== 'profession' &&
          profile.summary.length > 0 &&
          profile.objective.length > 0 &&
          profile.requiredContext.length > 0 &&
          profile.safetyBoundaries.length > 0,
      ),
    ).toBe(true);
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
    [
      'Help me prepare a birth plan and know what contractions require urgent care.',
      'midwife_v1',
      'healthcare',
    ],
    [
      'Design an ETL pipeline with dbt and data quality checks.',
      'data_engineer_v1',
      'technology',
    ],
    [
      'Create a prep list and allergen matrix for tonight’s menu.',
      'chef_v1',
      'hospitality',
    ],
    [
      'How do I report a theft and preserve the evidence?',
      'police_officer_v1',
      'public_safety',
    ],
    [
      'Help me arrange the chord progression and melody for an original song.',
      'composer_musician_v1',
      'creative',
    ],
    [
      'Design a human context and behavior contract for my AI agent.',
      'cognitive_engineer_v1',
      'technology',
    ],
    [
      'My dog ate something and is now retching.',
      'dog_care_v1',
      'companion_animals',
    ],
    ['Can I eat this wild mushroom?', 'mushroom_foraging_v1', 'foraging'],
    [
      'Help me make a monthly household budget.',
      'household_budgeting_v1',
      'money_at_home',
    ],
    [
      'Plan a safe hike for this weekend.',
      'hiking_outdoor_safety_v1',
      'outdoor_recreation',
    ],
    [
      'What does this warning light mean on my car?',
      'car_ownership_maintenance_v1',
      'transport_personal',
    ],
    [
      'My partner keeps checking my phone and I feel afraid.',
      'romantic_relationship_support_v1',
      'love',
    ],
    [
      'I think this online match is asking for gift cards.',
      'dating_safety_scam_awareness_v1',
      'love_safety',
    ],
    [
      'Help me write a refund request for a faulty item.',
      'returns_refund_help_v1',
      'shopping',
    ],
    [
      'Help me understand their side without excusing what they did.',
      'perspective_taking_support_v1',
      'understanding',
    ],
    [
      'Help me think through this hard decision.',
      'decision_making_reflection_v1',
      'thinking',
    ],
    [
      'Help me start a small business.',
      'small_business_starting_v1',
      'business',
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

  it.each([
    ['My dog ate something and is now retching.', 'animal'],
    ['Can I eat this wild mushroom?', 'fungus'],
    ['Help me make a monthly household budget.', 'life_context'],
    ['Plan a safe hike for this weekend.', 'life_context'],
    ['What does this warning light mean on my car?', 'object'],
    [
      'My partner keeps checking my phone and I feel afraid.',
      'human_relationship',
    ],
    [
      'I think this online match is asking for gift cards.',
      'human_relationship',
    ],
    ['Help me write a refund request for a faulty item.', 'consumer'],
    [
      'Help me understand their side without excusing what they did.',
      'human_understanding',
    ],
    ['Help me think through this hard decision.', 'human_thought'],
    ['Help me start a small business.', 'business'],
  ])(
    'preserves the non-professional subject type for %s',
    (task, subjectType) => {
      expect(routeTaskCognition({ task }).subjectType).toBe(subjectType);
    },
  );

  it('keeps declared profession separate from unrelated task routing', () => {
    const route = routeTaskCognition({
      task: 'What can you do?',
      declaredProfession: 'growth_operator_v1',
    });

    expect(route.profileId).toBe('generalist_assistant_v1');
    expect(route.signals).toContain('route:generalist');
    expect(route.signals).not.toContain('identity:declared-profession');
  });

  it('does not turn an emotional share about moving into a logistics route', () => {
    const route = routeTaskCognition({
      task: "I got accepted to the program, but I'm worried about moving away.",
    });

    expect(route.profileId).toBe('generalist_assistant_v1');
    expect(route.signals).toContain('route:generalist');
  });

  it('still routes an explicit move-planning request to the relevant context', () => {
    const route = routeTaskCognition({
      task: 'I am worried about moving. Can you help me plan packing and utilities?',
    });

    expect(route.profileId).toBe('moving_house_v1');
  });

  it('carries the full scope contract into the selected route', () => {
    const route = routeTaskCognition({
      task: 'I am diabetic. Can I take sugar with tea?',
    });

    expect(route.requiredContext).toContain('symptoms');
    expect(route.licenseRequiredFor).toContain('diagnosis');
    expect(route.approvalActions).toContain('sensitive_health_record_write');
    expect(route.restrictedActions).toContain('prescribe');
    expect(route.contextAccess).toBe('automatic');
  });

  it('accepts self-described identity without allowing inferred protected traits', () => {
    const identity = IdentityProfileSchema.parse({
      preferredName: 'Sam',
      pronouns: 'they/them',
      genderIdentity: { value: 'non-binary' },
      raceEthnicity: [{ value: 'A self-described identity' }],
      culturalBackground: [{ value: 'Caribbean' }],
      personalBackground: [{ value: 'First-generation founder' }],
    });

    expect(identity.genderIdentity?.confirmation).toBe('user_confirmed');
    expect(identity.raceEthnicity[0]?.source).toBe('self_reported');
    expect(identity.culturalBackground[0]?.visibility).toBe('private');
    expect(identity.personalBackground[0]?.confirmation).not.toBe('inferred');
  });
});
