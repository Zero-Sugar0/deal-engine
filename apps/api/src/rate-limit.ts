import type { Pool } from 'pg';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<
    string,
    { startedAt: number; count: number }
  >();

  constructor(private readonly maxEntries = 10_000) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const current = this.windows.get(key);
    const windowMs = windowSeconds * 1000;
    const item =
      !current || now - current.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : current;
    item.count += 1;
    this.windows.set(key, item);
    if (this.windows.size > this.maxEntries)
      this.windows.delete(this.windows.keys().next().value!);
    const remaining = Math.max(0, limit - item.count);
    return {
      allowed: item.count <= limit,
      limit,
      remaining,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((item.startedAt + windowMs - now) / 1000),
      ),
    };
  }
}

export class PostgresRateLimiter implements RateLimiter {
  private calls = 0;

  constructor(private readonly pool: Pool) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const result = await this.pool.query<{
      request_count: number;
      window_started_at: Date;
    }>(
      `INSERT INTO rate_limit_windows(key, window_started_at, request_count)
       VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_windows.window_started_at <= now() - ($2::integer * interval '1 second') THEN 1
           ELSE rate_limit_windows.request_count + 1
         END,
         window_started_at = CASE
           WHEN rate_limit_windows.window_started_at <= now() - ($2::integer * interval '1 second') THEN now()
           ELSE rate_limit_windows.window_started_at
         END,
         updated_at = now()
       RETURNING request_count, window_started_at`,
      [key, windowSeconds],
    );
    const row = result.rows[0]!;
    this.calls += 1;
    if (this.calls % 1000 === 0) {
      await this.pool.query(
        `DELETE FROM rate_limit_windows
          WHERE updated_at < now() - interval '2 days'`,
      );
    }
    const started = new Date(row.window_started_at).getTime();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000),
    );
    return {
      allowed: Number(row.request_count) <= limit,
      limit,
      remaining: Math.max(0, limit - Number(row.request_count)),
      retryAfterSeconds,
    };
  }
}
