# DEAL Dashboard

The user-facing control surface. It currently provides a focused trust console for the
first Growth Operator slice: profile, identity, response behavior, memory boundaries,
continuity, optional approvals, and recent audit history.

## Local development

```bash
pnpm install
cd apps/dashboard
../../node_modules/.bin/vite
```

Open `http://localhost:5173`. The dashboard defaults to the hosted deal API. Set
`VITE_DEAL_API_URL` only when using a self-hosted or local API. The human token is
entered privately in the connection panel and is never bundled into the frontend.

## Screens

1. **Human Profile** — identity, preferences, values, communication style
2. **Memory** — view, correct, forget, and export memories
3. **Agents** — connected Claude Code, Cursor, Codex, custom agents
4. **Delegations** — which agent relationships are active and for how long
5. **Approvals** — pending consequential actions
6. **Audit** — complete action and context history
7. **Expert Profiles** — activate Growth Operator, Household Manager, etc.
