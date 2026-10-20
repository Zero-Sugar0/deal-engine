# DEAL — Domain Expert Agent Layer

DEAL is a human-context engine for AI agents. It gives any connected agent—Claude Code, Cursor, Codex, GrokBot, or a custom agent—a portable, governed understanding of the person or organization it represents.

**Models give agents intelligence. Tools give them hands. DEAL gives them a human.**

## What DEAL provides

- Persistent human/organization persona
- Delegated agent identity and scoped authority
- Long-term structured memory
- Preferences, values, constraints, and boundaries
- Domain understanding and professional judgment rules
- A signed Human Context Packet for any agent runtime
- Consent, audit trail, and revocation
- Cross-agent continuity

## What DEAL does not do

DEAL does not replace model providers, agent frameworks, or tool vendors. It is the human-context and governance layer between them.

## Core concept

```text
User request
+ DEAL Human Context Packet
+ Agent identity and delegated authority
+ Memory, preferences, constraints, values
+ Judgment and escalation rules
+ Existing agent tools
= A context-aware, accountable agent
```

## Repository layout

```text
apps/
  api/                 DEAL control-plane API
  dashboard/           User-facing consent, memory, identity, audit UI
  docs-site/           Public documentation
packages/
  core/                Domain models, schemas, context compiler
  memory/              Memory adapter interface + Supermemory adapter
  identity/            Agent identity, delegation, scopes, tokens
  policy/              Judgment, boundaries, approvals, risk rules
  connectors/          MCP, Composio, browser, custom adapters
  sdk-ts/              TypeScript SDK for agent developers
  sdk-python/          Python SDK for agent developers
  evals/               Evaluation scenarios and golden datasets
infra/
  docker/              Local development services
  railway/             Deployment configuration
```

## MVP scope

1. One human/organization namespace
2. Persona and preference capture
3. Structured memory schema
4. Supermemory adapter
5. Agent identity with scopes and limits
6. Context Compiler API
7. Approval and audit log
8. TypeScript SDK + MCP server
9. Evaluation suite for one expert profile

## Planning docs

Detailed design notes live under [`plan/v1/`](plan/v1/):

- [`first.md`](plan/v1/first.md) — Why domain expert agents; professional intelligence architecture; Growth Operator wedge
- [`second.md`](plan/v1/second.md) — Memory strategy: Supermemory as substrate; DEAL schema, context compiler, governance

## License

Proprietary by default. Consider Apache-2.0 for SDKs and core schemas if you want ecosystem adoption.
