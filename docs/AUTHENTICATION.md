# deal authentication

deal uses Better Auth for human accounts and sessions, and keeps agent API
keys in the existing DEAL credential store.

```text
email + password
      ↓
Better Auth user/session in Postgres
      ↓
POST /v1/auth/provision
      ↓
DEAL human + organization + delegation + agent key
      ↓
agent uses the one-time `deal_...` key with /v1/context
```

Better Auth does not replace agent credentials. A browser session authorizes
human-owned dashboard operations; an agent continues to use its own scoped
bearer key. DEAL links the two systems through `external_identities` using
`issuer = 'better-auth'`.

## Environment

Set these in local `.env` or the API deployment environment:

```env
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=https://deal-engine.up.railway.app
BETTER_AUTH_TRUSTED_ORIGINS=https://your-dashboard.example
BETTER_AUTH_API_KEY=<Better Auth Dash API key>
DEAL_DASHBOARD_ORIGIN=https://your-dashboard.example
```

For local development, use `BETTER_AUTH_URL=http://localhost:3000` and trust
`http://localhost:5173`.

## Database migration

The API applies `infra/db/migrations/003_better_auth.sql` after the existing
DEAL migrations. The same schema can be checked or applied explicitly:

```bash
pnpm dlx auth@latest migrate --config apps/api/auth.config.ts
```

The config uses the existing `DATABASE_URL`; no second database is created.

## Dashboard behavior

The dashboard uses `better-auth/react` with the hosted DEAL API default. Users
do not enter a base URL or a human API key. Signup signs the user in, calls
`/v1/auth/provision`, and displays the first agent key once. Later keys are
created, rotated, or revoked from the Agents view.

The API also loads Better Auth Infra's `dash()` plugin. Its API key is read
from `BETTER_AUTH_API_KEY` on the server and is never sent to browsers. Leave
it empty for local auth-only development; configure it in production to enable
Better Auth Dash features.

## Email verification

Password signup is enabled immediately so the local and initial product flow
works without an email provider. For a stricter production policy, set
`DEAL_AUTH_REQUIRE_EMAIL_VERIFICATION=true` after connecting a verification
email sender to the Better Auth `sendVerificationEmail` callback. Do not turn
that flag on without delivery configured, or new accounts will have no way to
complete verification.
