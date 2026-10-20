import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { MemoryRecord } from '@deal/core';
import type { MemoryAdapter, MemoryHit, MemoryQuery } from './adapter.js';

export interface MemoryEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface HttpEmbeddingProviderOptions {
  url: string;
  apiKey?: string;
  model?: string;
}

/** Generic OpenAI-compatible embedding endpoint; the database remains canonical. */
export class HttpEmbeddingProvider implements MemoryEmbeddingProvider {
  constructor(private readonly options: HttpEmbeddingProviderOptions) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(this.options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.apiKey
          ? { authorization: `Bearer ${this.options.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        input: text,
        ...(this.options.model ? { model: this.options.model } : {}),
      }),
    });
    if (!response.ok)
      throw new Error(`Embedding request failed: ${response.status}`);
    const body = (await response.json()) as {
      embedding?: number[];
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = body.embedding ?? body.data?.[0]?.embedding;
    if (!embedding?.length)
      throw new Error('Embedding response did not contain a vector');
    return embedding;
  }
}

interface MemoryRow extends QueryResultRow {
  id: string;
  human_id: string;
  organization_id: string;
  kind: MemoryRecord['kind'];
  content: Record<string, unknown> | string;
  content_text: string;
  confidence: number | null;
  source: string | null;
  confirmation: MemoryRecord['confirmation'] | null;
  priority: number | null;
  sensitivity: MemoryRecord['sensitivity'] | null;
  external_ref: string | null;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  superseded_by: string | null;
  created_at: Date | string;
  lexical_score?: number;
  embedding?: number[] | null;
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function textFor(content: string | Record<string, unknown>): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    humanId: row.human_id,
    organizationId: row.organization_id,
    kind: row.kind,
    content: row.content,
    confidence: row.confidence === null ? undefined : Number(row.confidence),
    source: row.source ?? undefined,
    confirmation: row.confirmation ?? undefined,
    priority: row.priority === null ? undefined : Number(row.priority),
    sensitivity: row.sensitivity ?? undefined,
    externalRef: row.external_ref ?? undefined,
    validFrom: iso(row.valid_from),
    validUntil: iso(row.valid_until),
    supersededBy: row.superseded_by ?? undefined,
    createdAt: iso(row.created_at)!,
  };
}

function confirmationWeight(record: MemoryRecord): number {
  return record.confirmation === 'user_confirmed'
    ? 1
    : record.confirmation === 'agent_observed'
      ? 0.65
      : record.confirmation === 'inferred'
        ? 0.35
        : 0.5;
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export class PostgresMemoryAdapter implements MemoryAdapter {
  constructor(
    private readonly pool: Pool,
    private readonly embeddingProvider?: MemoryEmbeddingProvider,
  ) {}

  async get(memoryId: string): Promise<MemoryRecord | undefined> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, human_id, organization_id, kind, content, content_text, confidence,
              source, confirmation, priority, sensitivity, external_ref, valid_from,
              valid_until, superseded_by, created_at
         FROM memory_records
        WHERE id = $1 AND forgotten_at IS NULL`,
      [memoryId],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : undefined;
  }

  async list(
    humanId: string,
    organizationId?: string,
  ): Promise<MemoryRecord[]> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, human_id, organization_id, kind, content, content_text, confidence,
              source, confirmation, priority, sensitivity, external_ref, valid_from,
              valid_until, superseded_by, created_at
         FROM memory_records
        WHERE human_id = $1 AND ($2::uuid IS NULL OR organization_id = $2::uuid)
          AND forgotten_at IS NULL`,
      [humanId, organizationId ?? null],
    );
    return result.rows.map(rowToRecord);
  }

  async add(
    input: Omit<MemoryRecord, 'id' | 'createdAt'>,
  ): Promise<{ id: string }> {
    if (!input.organizationId)
      throw new Error('Memory records require an organizationId');
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const contentText = textFor(input.content);
    let embedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        embedding = await this.embeddingProvider.embed(contentText);
      } catch {
        // Memory writes remain durable when the optional semantic service is unavailable.
      }
    }
    await this.pool.query(
      `INSERT INTO memory_records
        (id, organization_id, human_id, kind, content, content_text, embedding,
         confidence, source, confirmation, priority, sensitivity, external_ref,
         valid_from, valid_until, superseded_by, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        input.organizationId,
        input.humanId,
        input.kind,
        JSON.stringify(input.content),
        contentText,
        embedding ? JSON.stringify(embedding) : null,
        input.confidence ?? null,
        input.source ?? null,
        input.confirmation ?? null,
        input.priority ?? 50,
        input.sensitivity ?? 'normal',
        input.externalRef ?? null,
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.supersededBy ?? null,
        createdAt,
      ],
    );
    return { id };
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const searchText = query.query?.trim() ?? '';
    let vector = query.embedding;
    if (!vector && this.embeddingProvider && searchText) {
      try {
        vector = await this.embeddingProvider.embed(searchText);
      } catch {
        // The indexed lexical path remains available if the embedding service is down.
      }
    }
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, human_id, organization_id, kind, content, content_text, confidence,
              source, confirmation, priority, sensitivity, external_ref, valid_from,
              valid_until, superseded_by, created_at, embedding,
              CASE WHEN $3 = '' THEN 0.0
                   ELSE ts_rank_cd(to_tsvector('simple', content_text),
                                   plainto_tsquery('simple', $3)) END AS lexical_score
         FROM memory_records
        WHERE human_id = $1
          AND ($2::uuid IS NULL OR organization_id = $2::uuid)
          AND ($4::text[] IS NULL OR kind = ANY($4::text[]))
          AND forgotten_at IS NULL
          AND (valid_from IS NULL OR valid_from <= now())
          AND (valid_until IS NULL OR valid_until > now())
          AND superseded_by IS NULL
          AND ($3 = '' OR $6::boolean OR to_tsvector('simple', content_text) @@ plainto_tsquery('simple', $3))
          AND (NOT $6::boolean OR embedding IS NOT NULL)
        ORDER BY lexical_score DESC, priority DESC, created_at DESC
        LIMIT $5`,
      [
        query.humanId,
        query.organizationId ?? null,
        searchText,
        query.kinds ?? null,
        vector ? 1000 : limit * 4,
        Boolean(vector),
      ],
    );
    const now = Date.now();
    return result.rows
      .map((row) => {
        const record = rowToRecord(row);
        const lexical = Number(row.lexical_score ?? 0);
        const semantic =
          vector && row.embedding ? (cosine(vector, row.embedding) + 1) / 2 : 0;
        const ageDays = Math.max(
          0,
          (now - new Date(record.createdAt).getTime()) / 86_400_000,
        );
        const recency = Math.max(0, 1 - ageDays / 365);
        const score =
          vector && row.embedding
            ? semantic * 0.65 +
              Math.min(1, lexical) * 0.15 +
              confirmationWeight(record) * 0.15 +
              recency * 0.05
            : Math.min(1, lexical) * 0.55 +
              confirmationWeight(record) * 0.25 +
              ((record.priority ?? 50) / 100) * 0.15 +
              recency * 0.05;
        return { ...record, score };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, limit);
  }

  async forget(memoryId: string): Promise<void> {
    await this.pool.query(
      'UPDATE memory_records SET forgotten_at = now() WHERE id = $1',
      [memoryId],
    );
  }

  async correct(
    memoryId: string,
    replacement: string | Record<string, unknown>,
  ): Promise<{ id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<MemoryRow>(
        `SELECT id, human_id, organization_id, kind, content, content_text, confidence,
                source, confirmation, priority, sensitivity, external_ref, valid_from,
                valid_until, superseded_by, created_at
           FROM memory_records WHERE id = $1 AND forgotten_at IS NULL FOR UPDATE`,
        [memoryId],
      );
      const record = result.rows[0] ? rowToRecord(result.rows[0]) : undefined;
      if (!record) throw new Error('Memory record not found');
      const replacementId = randomUUID();
      const createdAt = new Date().toISOString();
      const contentText = textFor(replacement);
      let embedding: number[] | null = null;
      if (this.embeddingProvider) {
        try {
          embedding = await this.embeddingProvider.embed(contentText);
        } catch {
          // Preserve the correction even if semantic enrichment is temporarily unavailable.
        }
      }
      await client.query(
        `INSERT INTO memory_records
          (id, organization_id, human_id, kind, content, content_text, embedding,
           confidence, source, confirmation, priority, sensitivity, created_at)
         VALUES ($1,$2,$3,'correction',$4::jsonb,$5,$6::jsonb,1,'user_correction','user_confirmed',100,$7,$8)`,
        [
          replacementId,
          record.organizationId,
          record.humanId,
          JSON.stringify(replacement),
          contentText,
          embedding ? JSON.stringify(embedding) : null,
          record.sensitivity ?? 'normal',
          createdAt,
        ],
      );
      await client.query(
        'UPDATE memory_records SET superseded_by = $1, valid_until = $2 WHERE id = $3',
        [replacementId, createdAt, memoryId],
      );
      await client.query('COMMIT');
      return { id: replacementId };
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  }
}
