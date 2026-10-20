# DEAL TypeScript SDK

The SDK is the typed client for the control-plane API. MCP and dashboard clients use the
same API contracts rather than duplicating policy logic.

```ts
import { DEAL } from '@deal/sdk-ts';

const deal = new DEAL({
  baseUrl: process.env.DEAL_API_URL ?? 'http://localhost:3000',
  apiKey: process.env.DEAL_API_KEY!,
});

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
