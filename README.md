# DEAL — Domain Expert Agent Layer

DEAL is a human-context engine for AI agents. It gives any connected agent—Claude Code, Cursor, Codex, GrokBot, or a custom agent—a portable, governed understanding of the person or organization it represents.

**Models give agents intelligence. Tools give them hands. DEAL gives them a human.**

## What DEAL provides

- Persistent human/organization persona
- Layered self-concept, biography, identity facets, and values hierarchy
- Audience-specific communication modes and response examples
- Relationship trust context, emotional cues, repair protocol, and consent boundaries
- Decision heuristics, tradeoffs, escalation triggers, and red lines
- Delegated agent identity and scoped authority
- Long-term structured memory
- Preferences, values, constraints, and boundaries
- Domain understanding and professional judgment rules
- A signed Human Context Packet for any agent runtime
- Consent, audit trail, and revocation
- Cross-agent continuity
- Explicit response guidance: how to speak, disagree, admit uncertainty, and correct mistakes

## Product boundary

DEAL is the humanization layer. It does not try to become a CRM, mail client,
calendar, browser, or general-purpose tool router. The host agent already owns
those capabilities.

DEAL owns the human model that the host agent should carry into those tasks:
identity, persona, values, preferences, boundaries, decision style, behavioral
contracts, memory provenance, conversation continuity, feedback, and truthful
response guidance.

The separation is intentional:

```text
Host agent = model, tools, execution, external systems
DEAL       = human identity, context, memory, behavior, continuity, grounding
```

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
packages/
  core/                Domain models, schemas, context compiler
  skills/              Portable Agent Skills parser and metadata catalog
  memory/              Memory adapter interface + Supermemory adapter
  policy/              Deterministic judgment and boundary rules
  sdk/                 TypeScript SDK for agent developers
  sdk-python/          Python SDK for agent developers
  evals/               Evaluation scenarios and golden datasets
apps/mcp/               MCP adapter for the context engine
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

## Current implementation

The first runnable vertical slice is now available:

- Fastify control-plane API under `apps/api`
- Versioned schemas and context compiler under `packages/core`
- Portable Agent Skills bridge under `packages/skills`; skills remain host-owned
  while DEAL binds their metadata to the signed human context packet
- Deterministic policy engine under `packages/policy`
- Memory adapter contract, local adapter, and Supermemory adapter under `packages/memory`
- TypeScript client under `packages/sdk` and a dependency-free Python client under `packages/sdk-python`
- Provider-native TypeScript integrations for LangChain, OpenAI Agents, Claude, Vercel AI SDK/AI Gateway, and OpenRouter under `packages/sdk`
- Postgres migration with tenant isolation under `infra/db/migrations`
- Vite trust dashboard under `apps/dashboard`
- MCP stdio adapter under `apps/mcp`
- Growth Operator workflow state machine and evaluation suite under `packages/evals`
- OpenAPI contract under `docs/openapi.yaml`
- Integration tests for context, policy, approvals, execution verification, memory correction, workflows, and audit

Run it locally:

```bash
pnpm install
./node_modules/.bin/tsc -p packages/core/tsconfig.json
./node_modules/.bin/tsc -p packages/skills/tsconfig.json
./node_modules/.bin/tsc -p packages/policy/tsconfig.json
./node_modules/.bin/tsc -p packages/memory/tsconfig.json
./node_modules/.bin/tsc -p packages/sdk/tsconfig.json
./node_modules/.bin/tsc -p apps/api/tsconfig.json
node apps/api/dist/index.js
```

For local Postgres development:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres
DATABASE_URL=postgres://deal:deal@localhost:5432/deal pnpm --filter @deal/api dev
```

The API applies the migration and uses Postgres as the authoritative multi-instance
store. Requests refresh a current snapshot, persist only their changed entities in
a transaction, and serialize process-local access so concurrent instances do not
overwrite unrelated state. The human model is layered and versioned rather than
being a single persona prompt.

Production controls now include:

- `/readyz` database readiness and `/metrics` Prometheus output, with request IDs
  and structured request logs.
- Atomic Postgres rate limits for authenticated credentials and IP fallbacks.
- Optional external OIDC/JWT verification through a configured JWKS endpoint;
  verified identities must be explicitly linked by a human at
  `POST /v1/auth/external/link`.
- Durable Postgres memory retrieval using full-text ranking, provenance filters,
  correction lineage, and optional embedding vectors from an OpenAI-compatible
  endpoint. Full-text retrieval remains the deterministic fallback when no
  embedding provider is configured.
- Optional Supermemory v4 hybrid retrieval, mirrored after canonical Postgres
  writes and re-validated against Postgres before results reach an agent.

The dashboard also includes a `Try it` area for testing the humanization layer
without opening a terminal. It sends one authenticated request to
`POST /v1/experiments/compare`; the API compiles the same scoped context packet
used by connected agents, then runs a plain generation and a context-guided
generation through the configured Vercel AI Gateway model. Responses render as
safe GitHub-Flavored Markdown, and the composer accepts one image attachment.
Configure these values on the API only:

```bash
AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
AI_GATEWAY_MODEL=provider/model-id
AI_GATEWAY_MAX_OUTPUT_TOKENS=500
AI_GATEWAY_TEMPERATURE=0
```

The API can also use per-person Bring Your Own Key (BYOK) credentials saved
from the Developer page. Those credentials are encrypted at rest with
`DEAL_CREDENTIAL_ENCRYPTION_KEY`, never returned after saving, and take
precedence over the server-wide `AI_GATEWAY_API_KEY` and
`AI_GATEWAY_MODEL`. The server-wide values remain a useful fallback for local
development and shared deployments.

The browser never receives the gateway key. The dashboard uses the Better Auth
session, and the API returns only the two answers plus non-sensitive comparison
metadata.

External systems and tool credentials remain owned by the host agent and are
intentionally outside this repository’s core scope.

## Attach DEAL to an existing agent

DEAL is intentionally a thin context layer. The host runtime keeps its model,
tools, execution loop, and provider credentials. Install or import the SDK and
use the adapter native to the runtime:

```ts
import {
  deal,
  createDealAgentRuntime,
  createDealOpenAIInstructions,
} from '@deal/sdk';

// Hosted deal: the sdk has the API endpoint built in. Keep this key server-side.
const client = new deal(process.env.DEAL_API_KEY!);
const runtime = createDealAgentRuntime(client);

const instructions = createDealOpenAIInstructions({
  runtime,
  request: ({ context }) => ({
    task: context.task,
    conversationId: context.conversationId,
    channel: 'openai_agents',
  }),
});
```

For LangChain, AI SDK, Claude, OpenAI Responses, and OpenRouter, the adapters
can infer the task from the current chat messages. A custom `request` function
is only needed when an application has its own run-context shape. Self-hosted
installations can still pass `{ apiKey, baseUrl }` to `deal`.

The full integration guide, including LangChain middleware, Claude system
prompts, AI SDK/AI Gateway middleware, OpenRouter, outcomes, and security rules
is in [`docs/AGENT_INTEGRATIONS.md`](docs/AGENT_INTEGRATIONS.md).

The researched Agent Skills model and the DEAL composition contract are in
[`docs/SKILLS.md`](docs/SKILLS.md).

Professional roles, domain enrollment, verified facts, behavioral patterns, and
regulated-domain boundaries are documented in
[`docs/PROFESSIONAL_CONTEXT.md`](docs/PROFESSIONAL_CONTEXT.md).

## Planning docs

Detailed design notes live under [`plan/v1/`](plan/v1/):

- [`first.md`](plan/v1/first.md) — Why domain expert agents; professional intelligence architecture; Growth Operator wedge
- [`second.md`](plan/v1/second.md) — Memory strategy: Supermemory as substrate; DEAL schema, context compiler, governance

## License

Proprietary by default. Consider Apache-2.0 for SDKs and core schemas if you want ecosystem adoption.
