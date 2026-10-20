# DEAL Dashboard

The public product surface for deal. It includes the marketing homepage, sign-in and
sign-up entry points, and the authenticated workspace shell for human context, agents,
memory, approvals, and audit.

## Local development

```bash
pnpm install
cd apps/dashboard
../../node_modules/.bin/vite
```

Open `http://localhost:5173`. The dashboard is configured to use the hosted deal API
without exposing infrastructure configuration in the user interface. Set
`VITE_DEAL_API_URL` only when using a self-hosted or local API.

Routes:

- `/` — product homepage
- `/sign-in` — sign-in entry point
- `/sign-up` — workspace creation entry point
- `/app` — human context workspace

## Screens

1. **Human Profile** — identity, preferences, values, communication style
2. **Memory** — view, correct, forget, and export memories
3. **Agents** — connected Claude Code, Cursor, Codex, custom agents
4. **Delegations** — which agent relationships are active and for how long
5. **Approvals** — pending consequential actions
6. **Audit** — complete action and context history
7. **Expert Profiles** — activate Growth Operator, Household Manager, etc.
