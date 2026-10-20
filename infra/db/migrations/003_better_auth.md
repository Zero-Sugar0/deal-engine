# Better Auth migration

Better Auth owns its own `user`, `session`, `account`, and `verification`
tables. They are intentionally separate from DEAL's `humans`, `agents`, and
delegations tables.

Apply the versioned Better Auth schema against the same `DATABASE_URL` used by
DEAL:

```bash
pnpm dlx auth@latest migrate --config apps/api/auth.config.ts
```

The DEAL-to-auth link is stored in the existing `external_identities` table
with `issuer = 'better-auth'` and the Better Auth user id as `subject`.
