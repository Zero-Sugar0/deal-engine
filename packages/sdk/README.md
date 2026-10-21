# deal sdk

The SDK is the typed client for the control-plane API. MCP and dashboard clients use the
same API contracts rather than duplicating policy logic.

```bash
pnpm add @deal/sdk @deal/skills
```

```ts
import { deal } from '@deal/sdk';
import { parseSkillMarkdown } from '@deal/skills';

// Hosted deal: only the API key is required. Never expose it to browser code.
const client = new deal(process.env.DEAL_API_KEY!);
const skill = parseSkillMarkdown(skillMarkdown, { source: 'project' });

const context = await client.getContext({
  task: 'Prepare release notes for v2.4',
  conversationId: 'conversation_123',
  skills: [skill.descriptor],
});

const profile = await client.getProfile();
await client.updateProfile({
  selfConcept: {
    summary: 'A careful builder who prefers durable trust.',
    valuesHierarchy: [{ value: 'trust', priority: 100 }],
  },
  persona: {
    askStyle: 'one_question_at_a_time',
    leadWith: 'recommendation',
  },
});

const decision = await client.checkPermission({
  contextPacketId: context.packetId,
  action: 'external_commitment',
  recipientCount: 10,
});

if (decision.decision === 'require_approval') {
  const approval = await client.requestApproval({
    contextPacketId: context.packetId,
    action: 'external_commitment',
    summary: 'Commit to the reviewed external action',
    payload: { target: 'host-system' },
  });
  // A human approves in the dashboard, then the agent calls consumeApproval.
}
```

### Agent runtime integrations

`@deal/sdk` also provides provider-native adapters so deal can be attached to
an existing agent without taking ownership of its tools or model loop:

```ts
import { createDealAgentRuntime, createDealAISDKMiddleware } from '@deal/sdk';
import { gateway } from '@ai-sdk/gateway';
import { wrapLanguageModel } from 'ai';

const runtime = createDealAgentRuntime(deal);
const model = wrapLanguageModel({
  model: gateway(process.env.AI_GATEWAY_MODEL!),
  middleware: [
    createDealAISDKMiddleware({
      runtime,
      context: {
        channel: 'ai_sdk',
        conversationId: process.env.CONVERSATION_ID,
      },
    }),
  ],
});
```

On each model call the middleware extracts the latest user message, requests a
short-lived signed context packet, validates it, and injects only relevant human
context plus compact conversational signals: the current move, response move,
reply shape, whether help was requested, whether the message refers to recent
turns, and safety priority. It also includes the selected abstract response
approach and the compiled conversational defaults, but never sample replies or
output-token limits. Recent human/assistant text turns are inferred from the
provider's message list (up to 8 turns and 2,000 characters each); system and
tool messages are excluded. The current user message is not duplicated in that
history window. The host still sends its full conversation to the model. These
defaults work even when the user skips profile setup, and saved identity and
communication preferences are applied when configured. The host agent owns its
model, tools, and execution loop.

Use `createDealLangChainMiddleware`, `createDealOpenAIInstructions`,
`withDealOpenAIResponsesRequest`, `withDealClaudeMessagesRequest`, or
`withDealOpenRouterRequest` for the other provider-native surfaces. See
[`docs/AGENT_INTEGRATIONS.md`](../../docs/AGENT_INTEGRATIONS.md) for complete
examples and the lifecycle/security contract.

The hosted endpoint is built into the sdk. Hosted users only provide an API key.
Self-hosted users can optionally override it with `new deal({ apiKey, baseUrl })`
or `DEAL_API_URL`.

### Combining skills and deal

The host agent still owns skill loading and execution. Pass the active skill
descriptor to `getContext` or the runtime's `context` defaults; deal returns the
human layer plus an explicit precedence contract. The skill's instructions,
references, assets, and scripts stay with the host agent and never grant deal
authority.

```ts
const prepared = await runtime.prepare({
  task: 'Reply to this customer',
  channel: 'support',
  skills: [skill.descriptor],
});

// Combine in the host runtime's system-instruction boundary:
// deal authority + human context > skill instructions > skill resources
```
