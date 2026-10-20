# DEAL Architecture

## High-level architecture

```text
Connected Agent
Claude Code · Cursor · Codex · GrokBot · Custom Agent
                     │
                     ▼
          DEAL SDK / MCP Server
                     │
                     ▼
┌────────────────────────────────────────────────┐
│                DEAL Control Plane              │
│                                                │
│  Context API                                   │
│  Persona Compiler                              │
│  Identity & Delegation Service                 │
│  Memory Schema Service                         │
│  Judgment & Policy Engine                      │
│  Consent, Audit, Revocation                    │
│  Evaluation Service                            │
└────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│           Memory / Context Infrastructure      │
│  Supermemory · Postgres · pgvector · Graph     │
└────────────────────────────────────────────────┘
                     │
                     ▼
        Host-agent systems and tools
   The host agent owns these integrations; DEAL does not
```

## Services

### Context API

The only interface most agents need.

`POST /v1/context`

Returns a scoped, signed Human Context Packet.

### Agent integration boundary

The TypeScript SDK exposes a provider-neutral `DealAgentRuntime` and thin
provider-native adapters. The runtime fetches and validates a packet, renders a
model-facing instruction projection, caches only until packet expiry, and
provides explicit outcome/feedback methods. Adapters translate that projection
into the host framework's existing lifecycle:

| Host runtime                          | Native DEAL integration point                         |
| ------------------------------------- | ----------------------------------------------------- |
| LangChain v1                          | `wrapModelCall` middleware                            |
| OpenAI Agents SDK                     | async `Agent.instructions` callback                   |
| OpenAI Responses / Chat Completions   | `instructions` or system message                      |
| Anthropic Messages / Claude Agent SDK | top-level `system` / `systemPrompt`                   |
| Vercel AI SDK / AI Gateway            | Language Model Specification v4 `transformParams`     |
| OpenRouter                            | AI SDK middleware or OpenAI-compatible system message |

No adapter executes tools, stores provider credentials, or implements a second
agent loop. The host remains responsible for tool calls, consequential-action
checks, approvals, and external systems. See
[`AGENT_INTEGRATIONS.md`](AGENT_INTEGRATIONS.md) for current examples.

### Persona Compiler

Converts onboarding answers, connected context, documents, and corrections into a stable human persona.

### Identity Service

Registers agents and issues delegated, scoped, short-lived credentials.

### Memory Schema Service

Owns the canonical DEAL object model: human, organization, preferences, boundaries, history, outcomes, and corrections.

### Human Model and Judgment Engine

Compiles identity, self-concept, biography, persona mechanics, relationship
contexts, relational cues, decision heuristics, boundaries, behavioral contract,
memory provenance, conversation continuity, and response guidance. Its deterministic
boundary evaluator can additionally explain whether a host-agent action should
be allowed, approved, escalated, redacted, or denied; it never executes that
action.

### Audit Service

Records every context disclosure, decision, approval, action, and outcome.

## Context Packet

```json
{
  "packet_id": "ctx_123",
  "issued_at": "2026-10-20T00:00:00Z",
  "expires_at": "2026-10-20T00:15:00Z",
  "principal": {
    "human_id": "sarah_123",
    "organization_id": "org_456"
  },
  "agent": {
    "agent_id": "agent_cursor_001",
    "runtime": "cursor",
    "delegation_id": "del_789"
  },
  "persona": {
    "name": "Sarah",
    "role": "Founder",
    "communication_style": "direct, concise",
    "values": ["privacy", "quality", "speed"]
  },
  "domain": {
    "business": "B2B HR SaaS",
    "icp": "HR leaders at US companies with 50-500 employees",
    "exclusions": ["agencies", "current customers"]
  },
  "memory": {
    "preferences": ["Prefer concise, evidence-led explanations"],
    "corrections": ["Do not repeat an approach the human rejected"],
    "recent_outcomes": []
  },
  "behavior": {
    "relationship": "collaborator",
    "when_uncertain": "state_uncertainty",
    "when_disagreeing": "surface_tradeoff",
    "when_wrong": "admit_and_correct"
  },
  "response_guidance": {
    "style": ["Lead with the point", "Prefer concise responses"],
    "avoid": ["Never claim unsupported certainty"]
  },
  "judgment": {
    "ask_if_missing": ["audience", "goal", "tone"],
    "escalate_if": ["legal claim", "financial commitment", "mass send"],
    "refuse_if": ["deceptive outreach", "unauthorized data use"]
  }
}
```

## Data flow

1. Agent requests context.
2. DEAL authenticates the agent and principal.
3. DEAL checks requested capabilities against delegated scopes.
4. DEAL retrieves relevant structured and semantic memory.
5. DEAL compiles and signs a Human Context Packet.
6. Agent performs work using its own model/tools.
7. Agent uses the response guidance to formulate a truthful response or plan.
8. For deployments that use DEAL’s optional boundary checks, the agent can ask
   DEAL to evaluate a proposed consequential action.
9. Agent reports outcome or human feedback; DEAL updates memory and evaluations.

## Memory strategy

Use existing memory infrastructure for retrieval and extraction. Use DEAL for canonical structure and governance.

| Concern                      | Owner                                                     |
| ---------------------------- | --------------------------------------------------------- |
| Canonical memory records     | DEAL/Postgres                                             |
| Durable lexical retrieval    | DEAL/Postgres                                             |
| Optional semantic reranking  | Configured embedding provider                             |
| External semantic substrate  | Supermemory v4 adapter (optional, canonical-first mirror) |
| Document/file ingestion      | Host agent or external substrate                          |
| Fact extraction              | Host agent or external substrate                          |
| User profile summary         | DEAL                                                      |
| Canonical persona schema     | DEAL                                                      |
| Identity and authority       | DEAL                                                      |
| Judgment and boundaries      | DEAL                                                      |
| Consent and audit            | DEAL                                                      |
| Cross-agent context contract | DEAL                                                      |

## Security model

- Namespace isolation per human/organization
- Least-privilege scopes
- Short-lived context packets
- Explicit delegation from human to agent
- Human approval for irreversible or high-risk actions
- Immutable audit log
- User-visible memory with edit/delete rights
- Token revocation and agent suspension
