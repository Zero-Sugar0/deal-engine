# deal skills

`@deal/skills` parses the open Agent Skills `SKILL.md` format and produces a
validated descriptor that can be sent with a deal context request.

It deliberately does not execute scripts, read references, or grant authority.
The host agent remains responsible for loading and running a skill. deal uses the
descriptor to bind the active workflow to the human context packet and makes the
precedence rule explicit: human identity, boundaries, policy, and delegated
authority outrank skill instructions.

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

// The host agent loads `skill.instructions` only when it activates the skill.
// prepared.systemInstruction contains only task-relevant human context data.
```

The parser follows the portable contract: `name` and `description` are required;
`references/`, `scripts/`, and `assets/` remain host-owned progressive-disclosure
resources.
