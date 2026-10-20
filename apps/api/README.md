# DEAL API

Runnable human-context API for layered identity, self-concept, biography,
persona mechanics, relationships, emotional context, boundaries, memory,
continuity, grounding, optional boundary decisions, and audit.

## Local development

```bash
pnpm install
pnpm --filter @deal/api dev
```

The local server seeds a demo Growth Operator namespace. Use `local-agent-key` for agent
requests and `local-human-key` for dashboard/human requests unless overridden by environment
variables.

Set `DATABASE_URL` to switch from the in-memory store to Postgres. The API applies the initial
migration on startup, hydrates its control-plane state, and flushes mutations back to Postgres.

```bash
curl http://localhost:3000/healthz
curl -X POST http://localhost:3000/v1/context \
  -H 'Authorization: Bearer local-agent-key' \
  -H 'Content-Type: application/json' \
  -d '{"task":"Help me decide what to prioritize this week"}'
```

## Environment variables

```env
DATABASE_URL=postgres://...
SUPERMEMORY_API_KEY=
DEAL_JWT_SECRET=
DEAL_SKILL_SIGNING_KEY_ID=deal-skill-key-1
DEAL_SKILL_SIGNING_PRIVATE_KEY=
DEAL_SKILL_SIGNING_PUBLIC_KEY=
MCP_SERVER_URL=
```

## Priority endpoints

- `POST /v1/context`
- `GET /v1/context/:id`
- `POST /v1/context/feedback`
- `GET /v1/context/feedback`
- `POST /v1/conversations`
- `POST /v1/conversations/:id/turns`
- `GET /v1/conversations/:id/turns`
- `POST /v1/policy/evaluate`
- `POST /v1/approvals`
- `POST /v1/approvals/:id/consume`
- `POST /v1/actions/verify`
- `POST /v1/memory/outcomes`
- `POST /v1/agents`
- `POST /v1/agents/:id/credentials/rotate`
- `POST /v1/credentials/:id/revoke`
- `POST /v1/delegations`
- `POST /v1/delegations/:id/revoke`
- `GET /v1/skills`
- `POST /v1/skills`
- `POST /v1/skills/:id/review`
- `POST /v1/skills/:id/revoke`
- `GET /v1/profiles`
- `PATCH /v1/profile`
- `POST /v1/onboarding`
- `GET /v1/memory`
- `POST /v1/workflows`
- `GET /v1/workflows`
- `POST /v1/workflows/:id/transition`
- `GET /v1/approvals`
- `POST /v1/memory/:id/correct`
- `DELETE /v1/memory/:id`
- `GET /v1/audit`

The profile endpoints accept both the original flat onboarding fields and the
layered model sections (`identity`, `selfConcept`, `biography`, `persona`,
`relationships`, `relational`, `boundaries`, `decision`, and `behavior`). A
human-owned update increments the model version; agents receive the normalized
version in the signed schema-version-3 context packet. Sensitive profile facts
are withheld unless the delegation explicitly includes `sensitive_context_read`
in `mayRead`; redacted paths are recorded in the packet.
