import { describe, expect, it } from 'vitest';
import { InMemoryAdapter } from '../src/adapter.js';

describe('memory ranking and lineage', () => {
  it('ranks confirmed, relevant, high-priority memories first', async () => {
    const adapter = new InMemoryAdapter();
    await adapter.add({
      humanId: 'human_1',
      kind: 'episode',
      content: 'The team discussed positioning',
      confirmation: 'inferred',
      priority: 10,
    });
    const confirmed = await adapter.add({
      humanId: 'human_1',
      kind: 'correction',
      content: 'Use calm positioning language',
      confirmation: 'user_confirmed',
      priority: 100,
    });

    const results = await adapter.search({
      humanId: 'human_1',
      query: 'positioning language',
    });
    expect(results[0].id).toBe(confirmed.id);
    expect(results[0].score).toBeGreaterThan(0.8);
  });

  it('does not return expired or superseded memories', async () => {
    const adapter = new InMemoryAdapter();
    const expired = await adapter.add({
      humanId: 'human_1',
      kind: 'preference',
      content: 'Old preference',
      validUntil: new Date(Date.now() - 1000).toISOString(),
    });
    const active = await adapter.add({
      humanId: 'human_1',
      kind: 'preference',
      content: 'Current preference',
    });
    await adapter.correct(active.id, 'Corrected preference');
    const results = await adapter.search({ humanId: 'human_1' });
    expect(results.map((item) => item.content)).not.toContain('Old preference');
    expect(results.map((item) => item.id)).not.toContain(active.id);
    expect(expired.id).not.toBe(results[0]?.id);
  });
});
