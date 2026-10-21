import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ContextEntrySchema } from '@deal/core';
import { contextEntryCatalog, getContextEntry } from '../src/professions.js';
import { routeTaskCognition } from '../src/cognition-router.js';

describe('canonical v1 context registry', () => {
  it('validates every catalog entry and keeps ids unique', () => {
    expect(contextEntryCatalog.length).toBeGreaterThanOrEqual(130);
    expect(new Set(contextEntryCatalog.map((entry) => entry.id)).size).toBe(
      contextEntryCatalog.length,
    );
    for (const entry of contextEntryCatalog) {
      expect(ContextEntrySchema.parse(entry).id).toBe(entry.id);
      expect(entry.lifecycle.status).toBe('active');
      expect(entry.operatingPatterns.length).toBeGreaterThan(0);
    }
  });

  it('keeps the checked-in cognitive engineer v1 artifact valid', () => {
    const artifact = JSON.parse(
      readFileSync(
        new URL('../../../docs/cognitive-engineer-v1.json', import.meta.url),
        'utf8',
      ),
    );
    const entry = ContextEntrySchema.parse(artifact);
    expect(entry.id).toBe('cognitive_engineer_v1');
    expect(entry.version).toBe('1.0.0');
    expect(entry.lifecycle.status).toBe('review');
  });

  it('executes the cognitive engineer v1 evaluation cases', () => {
    const entry = getContextEntry('cognitive_engineer_v1');
    expect(entry).toBeDefined();
    for (const testCase of entry!.evaluation.testCases) {
      const route = routeTaskCognition({ task: testCase.input });
      expect(route.profileId).toBe(testCase.expectedRoute);
    }
  });

  it('keeps protected identity routing separate from identity inference', () => {
    const route = routeTaskCognition({
      task: 'Answer using my race, gender, and background',
    });
    expect(route.profileId).toBe('cognitive_engineer_v1');
    expect(route.transientFacts).not.toContain('inferred_identity');
  });
});
