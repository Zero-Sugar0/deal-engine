# Skills and deal

Agent Skills are a portable way to package a repeatable workflow. A skill is a
directory with a required `SKILL.md` and optional `scripts/`, `references/`, and
`assets/` directories. The format is deliberately smaller than an agent
framework: it describes how to perform a kind of work, while the host runtime
still owns the model, tools, files, permissions, and execution loop.

## What the major runtimes do

The current common pattern is progressive disclosure:

1. **Advertise** — the runtime discovers only `name` and `description`.
2. **Activate** — when a task matches, the runtime loads the full `SKILL.md`.
3. **Use resources** — the agent reads references or runs bundled scripts only
   when the skill instructions call for them.

Codex scans repository skills from `.agents/skills`; Claude Code uses
`.claude/skills`; LangChain Deep Agents accepts one or more skill sources and
uses `SkillsMiddleware`; OpenAI sandbox agents expose lazy skill sources through
the sandbox capabilities. These are different host mechanisms around the same
portable file contract.

## The division of responsibility

| Layer      | Owns                                                                                                              | Must not own                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Skill      | Procedure, domain playbook, examples, references, scripts                                                         | Human identity, consent, authority, approval, secrets                     |
| Host agent | Model, tools, files, skill loading, execution loop                                                                | Canonical human model or durable policy decisions                         |
| deal       | Identity, persona, current context, memory provenance, boundaries, delegation, policy, approvals, audit, outcomes | Provider credentials, CRM/email/calendar tools, arbitrary skill execution |

This makes deal more useful than skills alone: a finance skill can describe a
review workflow, but deal can determine the person's role, jurisdiction,
decision style, missing context, sensitive-data scope, and whether the proposed
action needs approval. The skill changes how the work is approached; deal
changes how that work should be approached for this human, now.

## Composition contract

The host agent parses the skill and sends its validated descriptor with the
context request:

```ts
import { parseSkillMarkdown } from '@deal/skills';
import { deal, createDealAgentRuntime } from '@deal/sdk';

const skill = parseSkillMarkdown(skillMarkdown, {
  source: 'project',
  directoryName: 'customer-replies',
});
const runtime = createDealAgentRuntime(new deal(process.env.DEAL_API_KEY!));

const prepared = await runtime.prepare({
  task: 'Reply to this customer',
  channel: 'support',
  skills: [skill.descriptor],
});

// The host runtime loads skill.instructions separately.
// prepared.systemInstruction supplies the signed human layer.
```

The signed packet makes this precedence explicit:

```text
DEAL authority and boundaries
  > DEAL human context and explicit corrections
  > skill instructions
  > skill references and scripts
```

This is a semantic contract and not a substitute for deterministic tool
authorization. The host must still call `deal_check_permission` before a
consequential tool action and use exact approval binding when required.

## Security invariants

- A skill descriptor is metadata and provenance, never an authority grant.
- DEAL does not execute `scripts/` or read remote skill resources on the API.
- Skill descriptions and outputs are untrusted workflow input.
- A skill cannot change `mayRead`, `mayWrite`, `mayDraft`, approval rules,
  sensitive-context access, identity disclosure, or human boundaries.
- The active skill version and SHA-256 content hash are included in the signed
  packet and `context.issued` audit event.
- The host should re-request context when the active skill, task, conversation,
  or human correction changes.

## What we built

- `@deal/core` — `SkillDescriptorSchema`, `SkillContextSchema`, and schema
  version `5` packets.
- `@deal/skills` — portable `SKILL.md` parsing, content hashing, warnings, and
  a small metadata catalog. It never executes skill code.
- `@deal/sdk` — `ContextRequest.skills` and rendered skill precedence guidance
  for every provider adapter.
- API and MCP — accepts up to 16 active skill descriptors and audits their
  identity without changing delegation authority.
- Python SDK — supports the same `skills` field and hosted API-key-only setup.

## Next production layer

The next optional capability is an organization skill registry: signed skill
artifacts, version pinning, review status, allowed sources, and revocation. It
should distribute and attest skills, not execute them. Execution remains inside
the host's sandbox or agent runtime.

## References

- [Agent Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [Codex skills](https://developers.openai.com/codex/skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [LangChain Deep Agents skills](https://docs.langchain.com/oss/python/deepagents/skills)
- [OpenAI Agents sandbox skills](https://openai.github.io/openai-agents-python/sandbox_agents/)
