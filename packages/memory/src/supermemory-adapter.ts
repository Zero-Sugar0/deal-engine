import type { MemoryAdapter, MemoryHit, MemoryQuery } from './adapter.js';
import type { MemoryRecord } from '@deal/core';

export interface SupermemoryAdapterOptions {
  apiKey: string;
  baseUrl?: string;
}

export class SupermemoryAdapter implements MemoryAdapter {
  private readonly baseUrl: string;

  constructor(private readonly options: SupermemoryAdapterOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.supermemory.ai';
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok)
      throw new Error(`Supermemory request failed with ${response.status}`);
    return (await response.json()) as T;
  }

  async add(
    input: Omit<MemoryRecord, 'id' | 'createdAt'>,
  ): Promise<{ id: string }> {
    const result = await this.request<{ id?: string }>('/v3/memories', {
      method: 'POST',
      body: JSON.stringify({
        content:
          typeof input.content === 'string'
            ? input.content
            : JSON.stringify(input.content),
        containerTag: input.humanId,
        metadata: { ...input, content: undefined },
      }),
    });
    return { id: result.id ?? crypto.randomUUID() };
  }

  async get(memoryId: string): Promise<MemoryRecord | undefined> {
    try {
      return await this.request<MemoryRecord>(
        `/v3/memories/${encodeURIComponent(memoryId)}`,
        { method: 'GET' },
      );
    } catch {
      return undefined;
    }
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const result = await this.request<{ results?: MemoryHit[] }>('/v3/search', {
      method: 'POST',
      body: JSON.stringify({
        q: query.query ?? '',
        containerTag: query.humanId,
        limit: query.limit ?? 20,
      }),
    });
    return result.results ?? [];
  }

  async forget(memoryId: string): Promise<void> {
    await this.request(`/v3/memories/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
    });
  }

  async correct(
    memoryId: string,
    replacement: string | Record<string, unknown>,
  ): Promise<{ id: string }> {
    await this.request(`/v3/memories/${encodeURIComponent(memoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        content:
          typeof replacement === 'string'
            ? replacement
            : JSON.stringify(replacement),
      }),
    });
    return { id: memoryId };
  }
}
