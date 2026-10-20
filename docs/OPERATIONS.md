# Production operations

DEAL is a context, identity, persona, memory, and governance plane. The host
agent owns its model provider and external tools; DEAL does not own CRM, email,
calendar, or OAuth connector credentials.

## Required deployment settings

- `DATABASE_URL`: shared Postgres 16+ connection string. Every API instance must
  use the same database.
- `DEAL_DB_POOL_MAX`, `DEAL_DB_CONNECTION_TIMEOUT_MS`, and
  `DEAL_DB_IDLE_TIMEOUT_MS`: tune bounded database connection usage.
- `DEAL_DATABASE_SSL=true` for TLS database connections; keep verification on
  unless the deployment explicitly provides a private test certificate.
- `DEAL_JWT_SECRET`: at least 32 random characters. It signs context and action
  packets.
- `DEAL_DASHBOARD_ORIGIN`: explicit browser origin in production.
- `DEAL_METRICS_TOKEN`: set this when `/metrics` is exposed outside a private
  network.

The migration is applied at startup. Run at least one instance with database
permission to apply migrations, or apply the SQL during deployment before
starting the rollout.

## Multi-instance behavior

Postgres is canonical. Each request obtains a current database snapshot and
persists only changed domain records inside a transaction. The API process uses
a small request lock around its compatibility map so concurrent requests cannot
mutate that map while it is being refreshed. Human profile writes use the
versioned `model_version` field and fail rather than silently overwriting a
concurrent update. Approval consumption is also conditional and cannot be
replayed by two instances.

Use `/healthz` for liveness and `/readyz` for traffic admission. A readiness
failure means the instance cannot reach its canonical database.

## Authentication

Local bearer credentials remain useful for service-to-service agent access. For
human access, configure:

```text
DEAL_AUTH_ISSUER=https://issuer.example.com/
DEAL_AUTH_AUDIENCE=deal-api
DEAL_AUTH_JWKS_URL=https://issuer.example.com/.well-known/jwks.json
DEAL_AUTH_ALGORITHMS=RS256
```

An operator first calls `POST /v1/auth/external/link` with a local human bearer
credential and a provider-issued JWT. Thereafter the verified external JWT can
authenticate that human. DEAL never auto-links by email and never trusts an
unverified subject claim.

## Memory retrieval

Postgres stores canonical memory records, validity windows, confirmation state,
correction lineage, and optional embeddings. Retrieval applies human,
organization, sensitivity, validity, and supersession filters before ranking.
Set `DEAL_EMBEDDING_URL` to an OpenAI-compatible embedding endpoint to enable
semantic reranking; without it, the indexed `tsvector` path is deterministic and
durable. The embedding service is an optimization, not the authority for memory.

For an additional managed semantic index, set `SUPERMEMORY_API_KEY` and leave
`SUPERMEMORY_API_VERSION=v4`. DEAL writes canonical records to Postgres first,
mirrors them to Supermemory with a `deal:<memory-id>` reference, and accepts
semantic hits only after resolving them back through Postgres. Supermemory v4 is
used for its documented create/search surface; DEAL's canonical state handles
corrections and forgetting, so stale remote hits are rejected. This keeps
Supermemory useful for recall without allowing remote results to bypass DEAL's
tenant, validity, supersession, sensitivity, or correction rules. Set
`SUPERMEMORY_API_VERSION=v3` only for an older compatible gateway.
`SUPERMEMORY_TIMEOUT_MS` bounds remote retrieval latency; Postgres retrieval
continues to work if Supermemory is unavailable or times out.

## Rate limits and observability

`DEAL_RATE_LIMIT_PER_MINUTE` controls the general limit (default `120`) and
`DEAL_CONTEXT_RATE_LIMIT_PER_MINUTE` controls context compilation (default
`30`). Postgres performs the increment atomically, so limits apply across API
instances. Responses include `X-Request-ID`, `RateLimit-*`, and `Retry-After`
when appropriate.

Scrape `/metrics` with Prometheus. The API emits bounded-cardinality request
counters and duration summaries, plus rate-limit rejection counts. Do not put
raw bearer tokens, memory content, or persona data into logs.
