import { describe, expect, it, vi } from 'vitest';
import { InMemoryAdapter } from '../src/adapter.js';
import { SupermemoryAdapter } from '../src/supermemory-adapter.js';

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

describe('Supermemory API contract', () => {
  it('uses the documented v4 batch-create and hybrid-search shapes', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.endsWith('/v4/memories'))
        return new Response(
          JSON.stringify({ memories: [{ id: 'remote_1' }] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      if (url.endsWith('/v4/search'))
        return new Response(
          JSON.stringify({
            results: [
              {
                content: 'Prefer calm, direct language',
                score: 0.93,
                docId: 'remote_1',
                metadata: {
                  humanId: 'human_1',
                  organizationId: 'org_1',
                  kind: 'preference',
                  confirmation: 'user_confirmed',
                  priority: 100,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      throw new Error(`Unexpected request ${url} ${JSON.stringify(body)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new SupermemoryAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://memory.test',
    });

    await expect(
      adapter.add({
        humanId: 'human_1',
        organizationId: 'org_1',
        kind: 'preference',
        content: 'Prefer calm, direct language',
        confirmation: 'user_confirmed',
      }),
    ).resolves.toEqual({ id: 'remote_1' });
    const results = await adapter.search({
      humanId: 'human_1',
      organizationId: 'org_1',
      query: 'language',
    });

    expect(results[0]).toMatchObject({
      id: 'remote_1',
      humanId: 'human_1',
      kind: 'preference',
      score: 0.93,
    });
    const createBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(createBody.memories[0].content).toBe('Prefer calm, direct language');
    const searchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(searchBody.query).toBe('language');
    expect(searchBody.containerTags).toEqual(['human_1']);
    expect(searchBody.searchMode).toBe('hybrid');
    expect(searchBody.filters.metadata.organizationId).toBe('org_1');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer test-key',
    });
    vi.unstubAllGlobals();
  });
});
