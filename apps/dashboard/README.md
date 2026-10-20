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

Open `http://localhost:5173`. The default API is `http://localhost:3000` and the default
local human token is `local-human-key`; both can be changed in the connection panel.

## Screens

1. **Human Profile** — identity, preferences, values, communication style
2. **Memory** — view, correct, forget, and export memories
3. **Agents** — connected Claude Code, Cursor, Codex, custom agents
4. **Delegations** — which agent relationships are active and for how long
5. **Approvals** — pending consequential actions
6. **Audit** — complete action and context history
7. **Expert Profiles** — activate Growth Operator, Household Manager, etc.
