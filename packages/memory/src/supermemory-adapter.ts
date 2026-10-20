import type { MemoryRecord } from '@deal/core';
import type { MemoryAdapter, MemoryHit, MemoryQuery } from './adapter.js';

export interface SupermemoryAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  /** Current documented API is v4; v3 remains available for older self-hosted gateways. */
  apiVersion?: 'v3' | 'v4';
  searchMode?: 'hybrid' | 'vector' | 'fulltext';
  chunkThreshold?: number;
  timeoutMs?: number;
}

interface RemoteMemoryResult {
  content?: string;
  score?: number;
  id?: string;
  docId?: string;
  chunkId?: string;
  metadata?: Record<string, unknown>;
}

interface RemoteMemoryResponse {
  id?: string;
  memories?: Array<{ id?: string; docId?: string; memoryId?: string }>;
  data?: Array<RemoteMemoryResult & { memoryId?: string }>;
  results?: RemoteMemoryResult[];
}

const memoryKinds = new Set<MemoryRecord['kind']>([
  'identity',
  'preference',
  'boundary',
  'correction',
  'episode',
  'outcome',
  'domain_knowledge',
  'relationship',
]);

function contentText(content: string | Record<string, unknown>): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export class SupermemoryAdapter implements MemoryAdapter {
  private readonly baseUrl: string;
  private readonly apiVersion: 'v3' | 'v4';

  constructor(private readonly options: SupermemoryAdapterOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.supermemory.ai').replace(
      /\/$/,
      '',
    );
    this.apiVersion = options.apiVersion ?? 'v4';
  }

  private endpoint(path: string): string {
    return `/${this.apiVersion}${path}`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal:
        init.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Supermemory request failed with ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      );
    }
    return (await response.json()) as T;
  }

  async add(
    input: Omit<MemoryRecord, 'id' | 'createdAt'>,
  ): Promise<{ id: string }> {
    const content = contentText(input.content);
    const metadata = {
      createdAt: new Date().toISOString(),
      humanId: input.humanId,
      organizationId: input.organizationId,
      kind: input.kind,
      confidence: input.confidence,
      source: input.source,
      confirmation: input.confirmation,
      priority: input.priority,
      sensitivity: input.sensitivity,
      externalRef: input.externalRef,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      supersededBy: input.supersededBy,
    };
    const result = await this.request<RemoteMemoryResponse>(
      this.endpoint('/memories'),
      {
        method: 'POST',
        body: JSON.stringify(
          this.apiVersion === 'v4'
            ? {
                containerTag: input.humanId,
                memories: [
                  {
                    content,
                    isStatic:
                      input.confirmation === 'user_confirmed' ||
                      input.kind === 'correction',
                    metadata,
                  },
                ],
              }
            : {
                content,
                containerTag: input.humanId,
                metadata,
              },
        ),
      },
    );
    const first = result.memories?.[0] ?? result.data?.[0];
    return {
      id:
        first?.id ??
        first?.docId ??
        (first as { memoryId?: string } | undefined)?.memoryId ??
        result.id ??
        crypto.randomUUID(),
    };
  }

  async get(memoryId: string): Promise<MemoryRecord | undefined> {
    if (this.apiVersion === 'v4') return undefined;
    try {
      const result = await this.request<RemoteMemoryResult>(
        this.endpoint(`/memories/${encodeURIComponent(memoryId)}`),
        { method: 'GET' },
      );
      return this.toRecord(result, {
        humanId: asString(result.metadata?.humanId) ?? '',
      });
    } catch {
      return undefined;
    }
  }

  async list(humanId: string): Promise<MemoryRecord[]> {
    return this.search({ humanId, query: '*', limit: 100 });
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const result = await this.request<RemoteMemoryResponse>(
      this.endpoint('/search'),
      {
        method: 'POST',
        body: JSON.stringify(
          this.apiVersion === 'v4'
            ? {
                query: query.query ?? '',
                containerTags: [query.humanId],
                limit: query.limit ?? 20,
                searchMode: this.options.searchMode ?? 'hybrid',
                ...(this.options.chunkThreshold === undefined
                  ? {}
                  : { chunkThreshold: this.options.chunkThreshold }),
                filters: {
                  metadata: {
                    humanId: query.humanId,
                    ...(query.organizationId
                      ? { organizationId: query.organizationId }
                      : {}),
                  },
                },
              }
            : {
                q: query.query ?? '',
                containerTag: query.humanId,
                limit: query.limit ?? 20,
              },
        ),
      },
    );
    const results = result.results ?? result.data ?? [];
    return results
      .map((item) => ({
        ...this.toRecord(item, query),
        score: item.score ?? 0,
      }))
      .filter(
        (item) => !query.kinds?.length || query.kinds.includes(item.kind),
      );
  }

  async forget(memoryId: string): Promise<void> {
    if (this.apiVersion === 'v4')
      throw new Error(
        'Supermemory v4 documents create and search; canonical DEAL state handles forgetting',
      );
    await this.request(
      this.endpoint(`/memories/${encodeURIComponent(memoryId)}`),
      { method: 'DELETE' },
    );
  }

  async correct(
    memoryId: string,
    replacement: string | Record<string, unknown>,
  ): Promise<{ id: string }> {
    if (this.apiVersion === 'v4')
      throw new Error(
        'Supermemory v4 does not document mutation of an existing memory; canonical DEAL state handles corrections',
      );
    await this.request(
      this.endpoint(`/memories/${encodeURIComponent(memoryId)}`),
      {
        method: 'PATCH',
        body: JSON.stringify({ content: contentText(replacement) }),
      },
    );
    return { id: memoryId };
  }

  private toRecord(
    item: RemoteMemoryResult,
    query: Pick<MemoryQuery, 'humanId' | 'organizationId'>,
  ): MemoryRecord {
    const metadata = asRecord(item.metadata);
    const rawKind = asString(metadata.kind);
    const kind =
      rawKind && memoryKinds.has(rawKind as MemoryRecord['kind'])
        ? (rawKind as MemoryRecord['kind'])
        : 'domain_knowledge';
    return {
      id:
        asString(metadata.memoryId) ??
        asString(metadata.dealMemoryId) ??
        item.docId ??
        item.chunkId ??
        item.id ??
        crypto.randomUUID(),
      humanId: asString(metadata.humanId) ?? query.humanId,
      organizationId: asString(metadata.organizationId) ?? query.organizationId,
      kind,
      content: item.content ?? asString(metadata.content) ?? '',
      confidence: asNumber(metadata.confidence),
      source: asString(metadata.source),
      confirmation: metadata.confirmation as MemoryRecord['confirmation'],
      priority: asNumber(metadata.priority),
      sensitivity: metadata.sensitivity as MemoryRecord['sensitivity'],
      externalRef: asString(metadata.externalRef),
      validFrom: asString(metadata.validFrom),
      validUntil: asString(metadata.validUntil),
      supersededBy: asString(metadata.supersededBy),
      createdAt: asString(metadata.createdAt) ?? new Date().toISOString(),
    };
  }
}
