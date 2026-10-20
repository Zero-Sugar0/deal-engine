# DEAL API

Control-plane API for context compilation, identity, policy, approvals, memory, and audit.

## Local development

```bash
pnpm install
pnpm dev
```

## Environment variables

```env
DATABASE_URL=postgres://...
SUPERMEMORY_API_KEY=
DEAL_JWT_SECRET=
MCP_SERVER_URL=
```

## Priority endpoints

- `POST /v1/context`
- `POST /v1/policy/evaluate`
- `POST /v1/approvals`
- `POST /v1/memory/outcomes`
- `POST /v1/agents`
- `POST /v1/delegations`
