// Adapter interface: swap Supermemory for another provider without changing DEAL.

export interface MemoryQuery {
  humanId: string;
  organizationId?: string;
  query: string;
  kinds?: string[];
  limit?: number;
}

export interface MemoryHit {
  id: string;
  kind: string;
  content: string;
  score: number;
  source?: string;
}

export interface MemoryAdapter {
  add(input: {
    humanId: string;
    organizationId?: string;
    kind: string;
    content: string | Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;

  search(query: MemoryQuery): Promise<MemoryHit[]>;

  forget(memoryId: string): Promise<void>;
}

// Implement using Supermemory's add/search/profile APIs.
export class SupermemoryAdapter implements MemoryAdapter {
  constructor(private readonly apiKey: string) {}

  async add(): Promise<{ id: string }> {
    throw new Error("Implement Supermemory add()");
  }

  async search(): Promise<MemoryHit[]> {
    throw new Error("Implement Supermemory search()");
  }

  async forget(): Promise<void> {
    throw new Error("Implement Supermemory forget()");
  }
}
