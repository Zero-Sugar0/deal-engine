# DEAL TypeScript SDK

The SDK is the typed client for the control-plane API. MCP and dashboard clients use the
same API contracts rather than duplicating policy logic.

```bash
pnpm add @deal/sdk-ts
```

```ts
import { DEAL } from '@deal/sdk-ts';

// Hosted DEAL: only the API key is required. Never expose it to browser code.
const deal = new DEAL(process.env.DEAL_API_KEY!);

const context = await deal.getContext({
  task: 'Prepare release notes for v2.4',
  conversationId: 'conversation_123',
});

const profile = await deal.getProfile();
await deal.updateProfile({
  selfConcept: {
    summary: 'A careful builder who prefers durable trust.',
    valuesHierarchy: [{ value: 'trust', priority: 100 }],
  },
  persona: {
    askStyle: 'one_question_at_a_time',
    leadWith: 'recommendation',
  },
});

const decision = await deal.checkPermission({
  contextPacketId: context.packetId,
  action: 'external_commitment',
  recipientCount: 10,
});

if (decision.decision === 'require_approval') {
  const approval = await deal.requestApproval({
    contextPacketId: context.packetId,
    action: 'external_commitment',
    summary: 'Commit to the reviewed external action',
    payload: { target: 'host-system' },
  });
  // A human approves in the dashboard, then the agent calls consumeApproval.
}
```

### Agent runtime integrations

`@deal/sdk-ts` also provides provider-native adapters so DEAL can be attached to
an existing agent without taking ownership of its tools or model loop:

```ts
import {
  createDealAgentRuntime,
  createDealAISDKMiddleware,
} from '@deal/sdk-ts';
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
short-lived signed context packet, validates it, and injects the human's
identity, communication style, values, boundaries, relationship guidance,
decision style, relevant memory evidence, and delegated behavior into the
provider's native system-instruction boundary. The host agent still owns its
model, tools, execution loop, approvals, and provider credentials.

Use `createDealLangChainMiddleware`, `createDealOpenAIInstructions`,
`withDealOpenAIResponsesRequest`, `withDealClaudeMessagesRequest`, or
`withDealOpenRouterRequest` for the other provider-native surfaces. See
[`docs/AGENT_INTEGRATIONS.md`](../../docs/AGENT_INTEGRATIONS.md) for complete
examples and the lifecycle/security contract.

The hosted default endpoint is `DEAL_DEFAULT_API_URL`. Self-hosted users can
override it with `new DEAL({ apiKey, baseUrl })` or `DEAL_API_URL`.
