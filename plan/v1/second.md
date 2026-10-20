**Use an existing memory engine like Supermemory as the storage and retrieval substrate—but do not let it define DEAL’s intelligence.** Build your own **DEAL memory schema, context compiler, and governance layer** on top of it.

Supermemory already handles the hard, undifferentiated parts: ingestion, embeddings/search, fact extraction, user profiles, contradiction handling, forgetting, and a memory graph. You should not rebuild that in v1.[1][2][3]

## The right split

| Layer                                        | Build or use existing?        | Why                                                                     |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Vector search, embeddings, RAG               | **Use Supermemory**           | Commodity infrastructure; fast to integrate                             |
| Raw conversation/document ingestion          | **Use Supermemory**           | It already supports text, URLs, files, and conversations [4][5]         |
| Fact extraction and contradiction resolution | **Use Supermemory initially** | Useful default behavior; replace later if needed                        |
| User profile summaries                       | **Use Supermemory initially** | It provides static plus dynamic profile context [4][6]                  |
| DEAL persona schema                          | **Build**                     | This is your product’s core IP                                          |
| Human identity and delegation                | **Build**                     | Memory vendors do not own your trust model                              |
| Judgment rules and boundaries                | **Build**                     | This is what makes agents behave like a competent human                 |
| Context packet compiler                      | **Build**                     | This turns raw memory into agent-ready human context                    |
| Consent, audit, revocation                   | **Build**                     | Required for real authority and enterprise adoption                     |
| Cross-agent continuity                       | **Build**                     | The reason an agent should use DEAL rather than its own isolated memory |

## Do not build “just memory”

If DEAL is only a wrapper around Supermemory, it is not defensible. Supermemory can remember that Sarah prefers concise emails; DEAL must understand:

```text
Sarah is a non-technical B2B SaaS founder.
She values qualified meetings over lead volume.
She allows email drafting but requires approval before sending.
She dislikes hype and wants direct messaging.
For senior prospects, she prefers LinkedIn-first outreach.
She has previously rejected campaigns targeting agencies.
```

Then DEAL compiles that into a **scoped Human Context Packet** for Cursor, Claude Code, Codex, GrokBot, or any connected agent.

That packet—not the raw memory store—is the product.

## DEAL memory model

Use Supermemory for retrieval, but impose your own object model:

```json
{
  "human": {
    "id": "sarah_123",
    "identity": {
      "role": "Founder",
      "communication_style": "direct",
      "values": ["privacy", "quality", "speed"]
    }
  },
  "context": {
    "business": {
      "product": "HR SaaS",
      "icp": "HR leaders at 50-500 employee US companies",
      "exclusions": ["agencies", "current customers"]
    }
  },
  "preferences": {
    "email_tone": "concise",
    "approval_threshold_usd": 50,
    "autonomous_actions": ["research", "draft"]
  },
  "history": {
    "rejected": ["generic templates", "agency targeting"],
    "preferred": ["LinkedIn-first for senior contacts"]
  },
  "authority": {
    "may_read": ["crm", "email", "analytics"],
    "may_send_email": "approval_required",
    "spend_limit_usd": 25
  }
}
```

Supermemory’s profile and graph features can store and retrieve much of this, but DEAL owns the **meaning, relationships, permissions, and versioning**. Its memory graph supports ontology-aware relationships, updates, contradictions, and inference, which you can use as the underlying graph substrate.[3]

## Recommended architecture

```text
Connected Agent
Claude Code / Cursor / Codex / GrokBot
              │
              ▼
       DEAL Context API
              │
┌──────────────────────────────────┐
│        DEAL Context Compiler     │
│  persona + authority + judgment  │
└──────────────────────────────────┘
              │
┌──────────────────────────────────┐
│         DEAL Memory Schema       │
│ identity · preferences · rules   │
│ history · outcomes · boundaries  │
└──────────────────────────────────┘
              │
┌──────────────────────────────────┐
│     Memory Infrastructure        │
│ Supermemory / pgvector / graph   │
└──────────────────────────────────┘
```

## Practical v1 decision

For your MVP:

1. **Use Supermemory** for raw memory, search, profiles, and document ingestion.
2. **Create a DEAL namespace per human/organization**, so context is isolated and portable across agents.
3. **Store structured DEAL records in Postgres** for identity, authority, consent, and policy—do not keep those only as vector memories.
4. **Write a Context Compiler** that merges:
   - DEAL structured profile
   - Supermemory profile
   - Relevant retrieved memories
   - Current task and requested permissions
5. **Return one signed context packet** to the agent.

Supermemory explicitly positions profiles as always-on context injected each turn, with separate retrieval for deeper search; that maps well to DEAL’s “always-on human context plus task-specific evidence” model.[6]

## When to build your own memory

Build your own memory engine later only if you need:

- Custom contradiction resolution based on professional judgment.
- Fine-grained provenance for regulated domains.
- Local/self-hosted memory for privacy-sensitive customers.
- A proprietary learning loop across many agents and domains.
- Memory that understands consequences, not just facts.

Until then, buying memory infrastructure lets you focus on the actual moat: **the human-context schema, judgment engine, identity model, and cross-agent portability.**

## Bottom line

> **Supermemory remembers. DEAL decides what the agent should understand, what it may do, and how it should behave.**

Use Supermemory as DEAL’s memory substrate; build DEAL as the human-context and judgment layer above it.

Sources
[1] Best AI Agent Memory Frameworks in 2026: Compared and Ranked https://atlan.com/know/best-ai-agent-memory-frameworks-2026/
[2] What is Supermemory? - supermemory | Memory API for the AI era https://supermemory.ai/docs/overview/what-is-supermemory
[3] llms.txt https://supermemory.ai/llms.txt
[4] Introduction - supermemory | Memory API for the AI era https://supermemory.ai/docs
[5] Supported content types - supermemory | Memory API for the AI era https://supermemory.ai/docs/concepts/content-types
[6] Quickstart - supermemory | Memory API for the AI era https://supermemory.ai/docs/quickstart
[7] Memory - AI SDK https://ai-sdk.dev/docs/agents/memory
[8] AI agent memory: types, architectures, and enterprise considerations https://www.dataiku.com/blog/ai-agent-memory
[9] supermemory · Plugin Catalog | Hermes Agent https://hermes-agent.nousresearch.com/docs/plugins/supermemory
[10] Best Memory APIs for AI Agents: How to Choose - Supermemory https://supermemory.ai/blog/best-memory-apis-stateful-ai-agents/
[11] Supermemory Tutorial: Add Persistent Memory to AI Agents https://www.datacamp.com/tutorial/supermemory-tutorial
[12] supermemory — Memory and continual learning for agents https://supermemory.ai/
[13] GitHub - supermemoryai/supermemory: Memory and context engine ... https://github.com/supermemoryai/supermemory
[14] Best AI Agent Memory Systems in 2026: 8 Frameworks ... https://vectorize.io/articles/best-ai-agent-memory-systems
[15] app-supermemory/README.md at main · code/app-supermemory https://github.com/code/app-supermemory/blob/main/README.md
