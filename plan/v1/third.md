Correct—**each Expert Profile should be deliberately tool-limited.** A profile is not “an agent that can use everything”; it is a professional role with a small, curated set of tools, a defined workflow, and clear boundaries. That limitation is what makes it reliable, safe, and genuinely expert-like.

Launch with **15 Expert Profiles**, each with roughly **3–7 core tools**, not 6,000.

## Expert Profile catalog

| #   | Expert Profile                    | Core job                                          | Limited toolset                                         | Primary outcome                             |
| --- | --------------------------------- | ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| 1   | **Growth Operator**               | Find, qualify, and nurture pipeline               | Lead data, CRM, email sequencer, calendar, web research | Qualified meetings booked                   |
| 2   | **Founder’s Chief of Staff**      | Run founder operations                            | Email, calendar, task manager, docs, browser            | Clear priorities and completed follow-ups   |
| 3   | **Household Operations Manager**  | Manage a home’s schedules, bills, and logistics   | Calendar, email, documents, shopping, reminders         | Household runs smoothly                     |
| 4   | **Personal Finance Organizer**    | Organize spending, bills, and savings preparation | Bank read-only, bills, spreadsheets, calendar           | Financial clarity; no unauthorized payments |
| 5   | **Recruiting Coordinator**        | Source, screen, schedule, and follow up           | ATS/CRM, email, calendar, job boards, resume parser     | Qualified candidates scheduled              |
| 6   | **Customer Success Manager**      | Onboard, monitor, and retain customers            | CRM, support desk, product analytics, email             | Retention, adoption, renewals               |
| 7   | **Support Triage Specialist**     | Classify, resolve, and escalate tickets           | Help desk, knowledge base, CRM, order system            | Faster resolution; correct escalations      |
| 8   | **Sales Call Prep Analyst**       | Prepare reps before meetings                      | CRM, call transcripts, enrichment, web research         | Meeting briefs and next-best actions        |
| 9   | **Content Marketing Strategist**  | Plan and draft content from real positioning      | Docs, CMS, analytics, web research, social scheduler    | Content calendar and drafts                 |
| 10  | **Teacher’s Assistant**           | Lesson prep, feedback, and student progress       | LMS, docs, grading tools, calendar                      | Prepared lessons and actionable feedback    |
| 11  | **Clinical Intake Coordinator**   | Collect intake details and prepare visits         | Scheduling, forms, EHR read-only, messaging             | Complete intake without clinical decisions  |
| 12  | **Legal Intake Assistant**        | Collect facts and organize documents              | Forms, document storage, calendar, CRM                  | Organized matter file; no legal advice      |
| 13  | **Engineering Release Assistant** | Prepare releases, changelogs, and QA checklists   | GitHub/GitLab, issue tracker, CI, docs                  | Clean release readiness                     |
| 14  | **Invoice & Payments Clerk**      | Prepare, reconcile, and chase invoices            | Accounting, invoicing, email, spreadsheet               | Fewer late payments; clean records          |
| 15  | **Research Analyst**              | Research, synthesize, and cite sources            | Web search, documents, notes, spreadsheet               | Decision-ready research brief               |

These map to proven vertical-agent categories: sales, support, recruiting, HR, finance, legal, healthcare, engineering, and operations.[1][2][3][4]

## Why tool limitation matters

A tool-limited profile creates four benefits:

1. **Higher accuracy:** The agent only sees relevant capabilities.
2. **Lower cost:** Fewer tool descriptions and fewer unnecessary calls.
3. **Better safety:** A clinical intake agent cannot deploy code or send mass emails.
4. **Clearer evaluation:** You can test exactly what the profile should and should not do.

For example, a **Clinical Intake Coordinator** should have scheduling, forms, messaging, and read-only EHR access—but it should never diagnose, prescribe, or make treatment decisions. Vertical healthcare agents already focus on bounded tasks such as symptom intake, documentation, and care coordination rather than open-ended medical judgment.[2][5]

## Profile schema

Each profile should be defined as:

```json
{
  "profile_id": "growth_operator_v1",
  "name": "Growth Operator",
  "objective": "Generate qualified pipeline and book meetings",
  "allowed_tools": [
    "lead_search",
    "crm_read",
    "crm_write",
    "email_draft",
    "email_send_with_approval",
    "calendar_check",
    "web_research"
  ],
  "forbidden_tools": [
    "code_deploy",
    "bank_transfer",
    "medical_advice",
    "legal_advice",
    "mass_send_without_approval"
  ],
  "required_context": ["business", "icp", "offer", "exclusions", "brand_voice"],
  "workflow": [
    "intake",
    "research",
    "qualify",
    "dedupe",
    "draft",
    "review",
    "approve",
    "send",
    "track",
    "report"
  ],
  "success_metric": "qualified_meetings_booked"
}
```

## Tool tiers

Use four permission tiers inside every profile:

| Tier              | Meaning                      | Examples                                             |
| ----------------- | ---------------------------- | ---------------------------------------------------- |
| **Read**          | Can view data                | CRM, calendar, documents, analytics                  |
| **Draft**         | Can prepare work             | Email draft, document draft, message draft           |
| **Act**           | Can execute low-risk actions | Create task, update CRM field, schedule hold         |
| **Consequential** | Requires approval            | Send campaign, spend money, delete data, deploy code |

This prevents the common failure where an agent has broad access but no professional judgment.

## Launch order

Do **not** launch all 15 at once. Launch in three waves:

### Wave 1 — Highest demand, easiest trust

1. Growth Operator
2. Founder’s Chief of Staff
3. Household Operations Manager
4. Personal Finance Organizer
5. Research Analyst

### Wave 2 — Business workflows

6. Recruiting Coordinator
7. Customer Success Manager
8. Support Triage Specialist
9. Sales Call Prep Analyst
10. Content Marketing Strategist

### Wave 3 — Regulated and high-trust domains

11. Teacher’s Assistant
12. Clinical Intake Coordinator
13. Legal Intake Assistant
14. Engineering Release Assistant
15. Invoice & Payments Clerk

Regulated profiles should launch last because they require stricter approvals, audit trails, and domain-specific evaluation. Legal and healthcare agents are commonly used for research, drafting, intake, documentation, and workflow support—not final professional judgment.[2][6][7]

## DEAL positioning update

> **DEAL gives any agent a professional identity, human context, and a limited set of tools matched to a real job.**

Or:

> **Not every agent needs 6,000 tools. It needs the right 5 tools, the right context, and the judgment to use them well.**

That is the DEAL difference: **tool-limited, human-context-rich, outcome-focused expert profiles.**

Sources
[1] 23 Real-World AI Agent Use Cases | Oracle Sverige https://www.oracle.com/artificial-intelligence/ai-agents/ai-agent-use-cases/
[2] Vertical AI Examples: 10 Agents Running in Production https://airbyte.com/agentic-data/vertical-ai-agents
[3] What Are Vertical AI Agents? Definition and How They Work https://monday.com/blog/ai-agents/what-are-vertical-ai-agents/
[4] 10 Agentic AI Examples and Use Cases - Boomi https://boomi.com/blog/10-agentic-ai-use-cases/
[5] 12 agentic AI use cases: How AI improves business operations https://nexos.ai/blog/agentic-ai-use-cases/
[6] Business AI agent examples https://www.hostinger.com/tutorials/ai-agent-examples/
[7] AI Agent Use Cases https://www.ibm.com/think/topics/ai-agent-use-cases
[8] AI Agent Examples: Real-World Use Cases Driving Business https://www.oneadvanced.com/resources/ai-agents-examples/
[9] What are Vertical AI Agents? +Top Use Cases & Platforms ... https://www.lindy.ai/blog/vertical-ai-agents
[10] www.ema.ai › define-persona-ai-agentPersona AI Agents: The CTO’s Guide to Enterprise - Ema https://www.ema.ai/additional-blogs/addition-blogs/define-persona-ai-agent
[11] www.lindy.ai › blog › examples-of-ai-agents24 AI Agent Examples & Real-World Use Cases - Fresh for 2026 https://www.lindy.ai/blog/examples-of-ai-agents
[12] www.chatbot.com · blog · best-ai-agentsBest AI Agents in 2026: What Actually Works - ChatBot https://www.chatbot.com/blog/best-ai-agents/
[13] Workday Sana vs Copilot, ChatGPT, Glean & More - Sana Labs https://sanalabs.com/agents-blog/enterprise-ai-agents-workday-sana-guide-2026
[14] Enterprise AI Solutions Guide – Top 17 Tools in 2026 | Reclaim https://reclaim.ai/blog/enterprise-ai-solutions
[15] www.jenova.ai › en › resourcesCustom AI Persona: How to Build Tailored AI Agents for Any ... https://www.jenova.ai/en/resources/custom-ai-persona
