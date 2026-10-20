# Deal Engine

**Most AI agents have tools. Ours have judgment.**

Deal Engine is a platform for **domain-trained agents** that behave like junior-but-capable professionals—not generic assistants with a pile of APIs.

We are building agents that understand professional workflows, handle exceptions, cite evidence, and know when to involve a human.

---

## The gap

Today most agent systems are:

> model + tools + prompts

They can call an API. They often cannot think the way a doctor, engineer, financial advisor, growth operator, or sales practitioner thinks. They miss:

- **Mental models** — forming and revising hypotheses under uncertainty
- **Tacit judgment** — knowing when a “correct” answer is unsafe or impractical
- **Process knowledge** — following real sequences instead of jumping to an answer
- **Exception handling** — the 5% of cases where the playbook fails
- **Accountability** — what must be verified, escalated, or refused
- **Feedback loops** — learning from corrections and outcomes, not just chat history

Research on agentic AI shows the same pattern: systems struggle with domain-specific reasoning and long professional workflows. Human–AI collaboration still outperforms AI alone in high-stakes work.

---

## What we are building

A **Domain Expert Agent Layer**.

Instead of:

> “Here are 6,000 tools. Pick a goal.”

We ship:

> “Here is a trained growth operator / clinical intake assistant / financial-planning associate / engineering QA agent. It knows the workflow, the rules, the failure modes, and when to ask a human.”

The architecture already provides the **hands** (orchestrator, tool routing, browser automation, SaaS integrations). Deal Engine adds the **professional brain**.

### Core layers

| Layer | Role |
|-------|------|
| **Domain ontology** | Entities, relationships, constraints, and terminology for the profession |
| **Playbooks** | Expert workflows as state machines, not vague prompts |
| **Case memory** | Client/context history, past decisions, exceptions, outcomes |
| **Evidence layer** | Claims must cite data, documents, or tool results |
| **Judgment engine** | Scores uncertainty, conflict, risk, and confidence |
| **Human checkpoints** | Ambiguous or high-stakes decisions route to an expert |
| **Evaluation suite** | Continuous tests against expert-labeled cases and edge conditions |

---

## What “intelligent” looks like

1. **Ask the missing question**  
   Not “here are 50 leads” — but clarifying ICP, decision-makers, funding signals, CRM duplicates, and exclusions before acting.

2. **Maintain a working hypothesis**  
   Form a theory of the bottleneck (e.g. lead quality vs. reply rate) and update it as evidence arrives.

3. **Know when not to act**  
   Pause before sending email, spending money, changing records, or making regulated claims.

4. **Explain reasoning and evidence**  
   Surface why accounts were chosen, what matched the ICP, and where confidence is medium because data was missing.

5. **Learn from corrections**  
   “Never contact CFOs at pre-seed companies” becomes a durable rule, not a forgotten chat message.

---

## First wedge: AI Growth Operator

We start with one high-value profession rather than boiling the ocean.

**Target:** non-technical founders and sales teams who need pipeline, not another chatbot with an enrichment API.

The Growth Operator:

- Understands ICP, positioning, offer, objections, and buying signals
- Treats a lead as more than an email address
- Checks deliverability, duplicates, CRM hygiene, suppression lists, timing, and messaging
- Requires human approval when campaigns cross risk thresholds
- Measures outcomes that matter: replies, meetings booked, cost per meeting—not tasks completed

That is already more operator-like than most “AI SDR” products.

---

## Unfair advantage

We are not starting from zero. The stack already includes:

- Orchestrator / control-plane concepts
- Tool routing and fast decision layers
- Browser automation for real-world execution
- Composio-style integrations for SaaS actions
- A focus on non-technical users

The missing piece is the **professional knowledge system**: playbooks, domain rules, case memory, expert checkpoints, and evaluation. That is what turns automation into something that can act like a capable junior professional.

---

## Positioning

> **Most AI agents have tools. Ours have judgment.**  
> We build domain-trained agents that understand professional workflows, handle exceptions, cite evidence, and know when to involve a human.

The hard part is not the model. It is capturing the invisible expertise of real practitioners and turning it into testable, reliable agent behavior.

---

## Repo layout

```
deal-engine/
├── plan/
│   └── v1/
│       └── first.md    # Full product thesis and architecture notes
├── .gitignore
└── README.md
```

See [`plan/v1/first.md`](plan/v1/first.md) for the detailed brief, research references, and design rationale.

---

## Status

Early planning. Architecture and first-domain playbook design in progress.

---

## License

TBD
