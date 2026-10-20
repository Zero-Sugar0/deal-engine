import type { MemoryRecord } from '@deal/core';

export interface MemoryQuery {
  humanId: string;
  organizationId?: string;
  query?: string;
  kinds?: MemoryRecord['kind'][];
  limit?: number;
  embedding?: number[];
}

export interface MemoryHit extends MemoryRecord {
  score: number;
}

export interface MemoryAdapter {
  add(input: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<{ id: string }>;
  get(memoryId: string): Promise<MemoryRecord | undefined>;
  list(humanId: string, organizationId?: string): Promise<MemoryRecord[]>;
  search(query: MemoryQuery): Promise<MemoryHit[]>;
  forget(memoryId: string): Promise<void>;
  correct(
    memoryId: string,
    replacement: string | Record<string, unknown>,
  ): Promise<{ id: string }>;
}

function searchable(record: MemoryRecord): string {
  return typeof record.content === 'string'
    ? record.content
    : JSON.stringify(record.content);
}

function confirmationWeight(record: MemoryRecord): number {
  switch (record.confirmation) {
    case 'user_confirmed':
      return 1;
    case 'agent_observed':
      return 0.65;
    case 'inferred':
      return 0.35;
    default:
      return 0.5;
  }
}

function recencyWeight(record: MemoryRecord, now: number): number {
  const ageDays = Math.max(
    0,
    (now - new Date(record.createdAt).getTime()) / 86_400_000,
  );
  return Math.max(0, 1 - ageDays / 365);
}

export class InMemoryAdapter implements MemoryAdapter {
  private readonly records = new Map<string, MemoryRecord>();

  get all(): MemoryRecord[] {
    return [...this.records.values()];
  }

  load(record: MemoryRecord): void {
    this.records.set(record.id, record);
  }

  async get(memoryId: string): Promise<MemoryRecord | undefined> {
    return this.records.get(memoryId);
  }

  async list(
    humanId: string,
    organizationId?: string,
  ): Promise<MemoryRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.humanId === humanId &&
        (!organizationId || record.organizationId === organizationId),
    );
  }

  async add(
    input: Omit<MemoryRecord, 'id' | 'createdAt'>,
  ): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    this.records.set(id, { ...input, id, createdAt: new Date().toISOString() });
    return { id };
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const terms = (query.query ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const now = Date.now();
    return [...this.records.values()]
      .filter((record) => record.humanId === query.humanId)
      .filter(
        (record) =>
          !query.organizationId ||
          record.organizationId === query.organizationId,
      )
      .filter(
        (record) => !query.kinds?.length || query.kinds.includes(record.kind),
      )
      .filter((record) => !record.supersededBy)
      .filter(
        (record) =>
          !record.validUntil || new Date(record.validUntil).getTime() > now,
      )
      .filter(
        (record) =>
          !record.validFrom || new Date(record.validFrom).getTime() <= now,
      )
      .map((record) => {
        const text = searchable(record).toLowerCase();
        const matchedTerms = terms.filter((term) => text.includes(term)).length;
        const lexical = terms.length ? matchedTerms / terms.length : 0.5;
        const priority = (record.priority ?? 50) / 100;
        const score =
          lexical * 0.55 +
          confirmationWeight(record) * 0.25 +
          priority * 0.15 +
          recencyWeight(record, now) * 0.05;
        return { ...record, score, matchedTerms };
      })
      .filter((record) => !terms.length || record.matchedTerms > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map(({ matchedTerms: _matchedTerms, ...record }) => record)
      .slice(0, query.limit ?? 50);
  }

  async forget(memoryId: string): Promise<void> {
    this.records.delete(memoryId);
  }

  async correct(
    memoryId: string,
    replacement: string | Record<string, unknown>,
  ): Promise<{ id: string }> {
    const record = this.records.get(memoryId);
    if (!record) throw new Error('Memory record not found');
    const replacementRecord: MemoryRecord = {
      ...record,
      id: crypto.randomUUID(),
      content: replacement,
      kind: 'correction',
      confidence: 1,
      source: 'user_correction',
      confirmation: 'user_confirmed',
      priority: 100,
      createdAt: new Date().toISOString(),
      supersededBy: undefined,
    };
    this.records.set(memoryId, {
      ...record,
      supersededBy: replacementRecord.id,
      validUntil: replacementRecord.createdAt,
    });
    this.records.set(replacementRecord.id, replacementRecord);
    return { id: replacementRecord.id };
  }
}
