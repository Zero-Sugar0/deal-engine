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
   Owned by Claude Code, Codex, Grok, or the host runtime
```

## Services

### Context API

The only interface most agents need.

`POST /v1/context`

Returns a scoped, signed Human Context Packet.

### Human Context Compiler

Converts onboarding answers, structured profile data, memory provenance,
conversation continuity, and corrections into a stable Human Model and explicit
response guidance.

### Identity Service

Registers agents and issues delegated, scoped, short-lived credentials.

### Memory Schema Service

Owns the canonical DEAL object model: human, organization, preferences, boundaries, history, outcomes, and corrections.

### Judgment and Boundary Engine

Determines whether an optional host-agent commitment should be allowed,
approved, escalated, redacted, or denied. It never executes external tools.

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
3. DEAL retrieves relevant structured and semantic memory.
4. DEAL compiles and signs a Human Context Packet.
5. Agent performs work using its own model and tools while following the packet.
6. Agent can report outcomes or human feedback to improve the model.
7. Deployments that need boundary checks can ask DEAL to evaluate a proposed
   host-agent commitment; DEAL returns allow, approval-required, escalate, or deny.

## Memory strategy

Use existing memory infrastructure for retrieval and extraction. Use DEAL for canonical structure and governance.

| Concern                        | Owner                                |
| ------------------------------ | ------------------------------------ |
| Embeddings and semantic search | Supermemory                          |
| Document/file ingestion        | Host agent or chosen memory provider |
| Fact extraction                | Supermemory initially                |
| User profile summary           | DEAL                                 |
| Canonical persona schema       | DEAL                                 |
| Identity and authority         | DEAL                                 |
| Judgment and boundaries        | DEAL                                 |
| Consent and audit              | DEAL                                 |
| Cross-agent context contract   | DEAL                                 |

## Security model

- Namespace isolation per human/organization
- Least-privilege scopes
- Short-lived context packets
- Explicit delegation from human to agent
- Human approval for irreversible or high-risk actions
- Immutable audit log
- User-visible memory with edit/delete rights
- Token revocation and agent suspension
