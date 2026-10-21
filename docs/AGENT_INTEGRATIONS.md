# Agent integrations

DEAL is designed to sit beside an existing agent runtime. It does not replace
the model, tool loop, tool permissions, or external-system clients owned by the
host application.

```text
host agent runtime
  ├── model provider
  ├── tools and external systems
  ├── approval/execution loop
  └── DEAL adapter
        ├── request scoped human context
        ├── inject identity/persona/behavior
        └── report outcomes and feedback
```

The TypeScript SDK exposes one stable runtime and thin native adapters:

```bash
pnpm add @deal/sdk
```

```ts
import { deal, createDealAgentRuntime } from '@deal/sdk';

// Hosted deal: an API key is sufficient. The URL is built into the sdk.
const client = new deal(process.env.DEAL_API_KEY!);

const runtime = createDealAgentRuntime(client);
const prepared = await runtime.prepareChat({
  messages: [
    { role: 'user', content: 'Draft a thoughtful reply to the customer' },
  ],
  conversationId: 'conversation_123',
  channel: 'support',
  audience: 'customer',
});

// `prepared.systemInstruction` is provider-neutral. The adapters below place
// it into the native hook for the runtime being used.
```

### Add a host-agent skill

Skills and DEAL solve different layers of the same turn. A skill owns a
repeatable procedure; DEAL owns the human model, provenance, boundaries,
authority, and correction rules. Parse the portable `SKILL.md` in the host
application and pass only its descriptor to DEAL:

```ts
import { parseSkillMarkdown } from '@deal/skills';

const skill = parseSkillMarkdown(skillMarkdown, {
  source: 'project',
  directoryName: 'customer-replies',
});

const prepared = await runtime.prepare({
  task: 'Reply to this customer',
  channel: 'support',
  skills: [skill.descriptor],
});

// The host skill runtime loads `skill.instructions`, references, and scripts.
// DEAL contributes the human context and the non-authority contract.
```

The portable skill lifecycle is progressive disclosure: metadata at discovery,
`SKILL.md` when activated, and `references/`, `assets/`, or `scripts/` only when
the skill needs them. DEAL never executes those files on the API server. When a
provider combines the two instruction sources, the intended precedence is:

```text
DEAL authority and boundaries
  > DEAL human context and corrections
  > skill instructions
  > skill references and scripts
```

This means a finance skill can teach a workflow for preparing a review, while
DEAL still decides whether the current person has supplied enough context, what
data may be shown, whether the agent must ask, and whether an action needs
approval. A skill cannot make an agent licensed, human, or authorized.

The runtime caches a packet only until its signed expiry. It also reads the
server's context revision before each preparation, so profile edits, memory
corrections, and forget operations automatically bypass stale cached packets.
`runtime.clearCache()` remains available for an immediate local reset.

For a task that needs explicit composition, pass context controls and the
tools the host intends to expose:

```ts
const prepared = await runtime.prepare({
  task: 'Draft a concise update in my work persona',
  audience: 'my team',
  context: {
    include: ['persona:work'],
    exclude: ['relationship:family'],
    usePersonalContext: true,
  },
  tools: [
    {
      name: 'mail_sender',
      action: 'external_commitment',
      effect: 'external',
    },
  ],
});
```

The returned signed packet exposes the selected and excluded contexts,
provenance-labelled facts, distilled context policy, and declared tool
manifest. Context reads do not require approval; consequential tool actions
must still pass policy evaluation and, when required, approval-token
verification at the host boundary.

## What happens during a chat turn

```text
user message
    │
    ▼
adapter extracts the current task + conversation metadata
    │
    ▼
DEAL /v1/context retrieves the structured human model and relevant memory
    │
    ▼
signed packet is validated and rendered as scoped system instructions
    │
    ▼
provider receives its normal request plus DEAL context
    │
    ▼
host agent responds and continues to own tools, execution, and approvals
```

This happens at the model boundary for every scoped turn. DEAL does not pretend
to be the model and it does not replace the host agent's conversation state. A
`conversationId` lets the API include the latest stored turns and open loops;
the host can report outcomes and corrections so the human model improves over
time.

## LangChain JavaScript

LangChain v1 uses `createAgent` and middleware hooks. DEAL uses
`wrapModelCall`, which changes the transient model request and does not persist
the context into the conversation state.

```ts
import { createAgent } from 'langchain';
import {
  createDealAgentRuntime,
  createDealLangChainMiddleware,
  taskFromMessages,
} from '@deal/sdk';

const runtime = createDealAgentRuntime(process.env.DEAL_API_KEY!);

const dealMiddleware = createDealLangChainMiddleware({
  runtime,
  context: {
    channel: 'langchain',
    conversationId: 'conversation_123',
  },
  baseInstructions: 'Use the host application tools only when appropriate.',
});

// The middleware infers the task from request.messages. If your application
// uses a custom LangChain runtime context, provide a request mapper instead:
const customDealMiddleware = createDealLangChainMiddleware({
  runtime,
  request: (request) => {
    const context = request.runtime?.context as { task?: string } | undefined;
    return {
      task: context?.task ?? taskFromMessages(request),
      channel: 'langchain',
    };
  },
});

const agent = createAgent({
  model: process.env.LANGCHAIN_MODEL!,
  tools: hostTools,
  middleware: [dealMiddleware],
});
```

For a real application, define a LangChain `contextSchema` for the task and
conversation ID and pass those values through the runtime context.

## OpenAI Agents SDK

The OpenAI Agents SDK supports an async `instructions` callback. Local
`RunContext` is not automatically visible to the model, so the DEAL adapter
maps the run context into a scoped instruction string.

```ts
import { Agent, run } from '@openai/agents';
import {
  deal,
  createDealAgentRuntime,
  createDealOpenAIInstructions,
} from '@deal/sdk';

type AppContext = {
  task: string;
  conversationId?: string;
};

const runtime = createDealAgentRuntime(process.env.DEAL_API_KEY!);

const agent = new Agent<AppContext>({
  name: 'DEAL-aware assistant',
  instructions: createDealOpenAIInstructions({
    runtime,
    request: ({ context }) => ({
      task: context.task,
      conversationId: context.conversationId,
      channel: 'openai_agents',
    }),
  }),
  tools: hostTools,
});

const result = await run(agent, userInput, {
  context: { task: userInput, conversationId: 'conversation_123' },
});
```

For the direct OpenAI Responses API, use the same runtime at the
`instructions` boundary:

```ts
import OpenAI from 'openai';
import { withDealOpenAIResponsesRequest } from '@deal/sdk';

const request = await withDealOpenAIResponsesRequest(
  { model: process.env.OPENAI_MODEL!, input: userInput },
  {
    runtime,
    context: { channel: 'openai_responses' },
  },
);
const response = await new OpenAI().responses.create(request);
```

Use the Agents SDK lifecycle events to instrument the host run. Report the
final outcome once the run completes:

```ts
await runtime.reportOutcome({
  contextPacketId: prepared.packetId,
  outcome: { result: 'completed', userFeedback: 'helpful' },
});
```

## Anthropic Claude Messages API

Claude's Messages API accepts a top-level `system` field. The adapter preserves
an existing system prompt and appends the scoped DEAL context.

```ts
import Anthropic from '@anthropic-ai/sdk';
import {
  deal,
  createDealAgentRuntime,
  withDealClaudeMessagesRequest,
} from '@deal/sdk';

const runtime = createDealAgentRuntime(process.env.DEAL_API_KEY!);

const request = await withDealClaudeMessagesRequest(
  {
    model: process.env.CLAUDE_MODEL!,
    max_tokens: 1200,
    system: 'Be useful and concise.',
    messages: [{ role: 'user', content: userInput }],
  },
  {
    runtime,
    context: { channel: 'claude_messages' },
  },
);

const response = await new Anthropic().messages.create(request);
```

For the Claude Agent SDK, use `createDealClaudeAgentOptions` immediately before
starting a run so the system prompt is scoped to the current task and packet
expiry.

## Vercel AI SDK and AI Gateway

The AI SDK middleware is model-provider neutral. It can wrap a model from AI
Gateway, OpenAI, Anthropic, or OpenRouter. The middleware implements the current
Language Model Specification v4 `transformParams` hook.

```ts
import { gateway } from '@ai-sdk/gateway';
import { streamText, wrapLanguageModel } from 'ai';
import {
  deal,
  createDealAgentRuntime,
  createDealAISDKMiddleware,
} from '@deal/sdk';

const runtime = createDealAgentRuntime(process.env.DEAL_API_KEY!);

const model = wrapLanguageModel({
  // Use an exact provider/model ID returned by the AI Gateway /v1/models API.
  model: gateway(process.env.AI_GATEWAY_MODEL!),
  middleware: [
    createDealAISDKMiddleware({
      runtime,
      context: { channel: 'ai_sdk' },
    }),
  ],
});

const result = streamText({ model, prompt: userInput });
```

The adapter can also be used with `generateText`, `ToolLoopAgent`, and any
other AI SDK feature that accepts a language model. DEAL does not see or own
the AI SDK tools.

## OpenRouter

OpenRouter can be used through the same AI SDK middleware. Its provider package
is only responsible for selecting the model; DEAL remains the context layer.

```ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { wrapLanguageModel } from 'ai';
import {
  deal,
  createDealAgentRuntime,
  createDealAISDKMiddleware,
} from '@deal/sdk';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const runtime = createDealAgentRuntime(process.env.DEAL_API_KEY!);

const model = wrapLanguageModel({
  model: openrouter.chat(process.env.OPENROUTER_MODEL!),
  middleware: [
    createDealAISDKMiddleware({
      runtime,
      context: { channel: 'openrouter' },
    }),
  ],
});
```

If the host uses OpenRouter's OpenAI-compatible Chat Completions endpoint
directly, use `withDealOpenRouterRequest` instead.

## Security and lifecycle rules

- Keep the DEAL API key server-side. Never put it in browser code or model
  prompts.
- Treat `systemInstruction` as a scoped projection, not a replacement for the
  host agent's policy and tool checks.
- Call DEAL's policy endpoint before consequential host-tool actions.
- Re-request context after expiry, task changes, human corrections, or material
  changes in conversation state.
- Report outcomes and corrections explicitly; context injection alone does not
  create durable learning.
- Keep provider and host-tool credentials outside DEAL. DEAL does not require
  CRM, email, calendar, or OAuth connectors.

## Official references

- [LangChain custom middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)
- [OpenAI Agents dynamic instructions and context](https://openai.github.io/openai-agents-js/guides/agents/)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Claude Agent SDK system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
- [AI SDK language model middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware)
- [Vercel AI Gateway models and providers](https://vercel.com/docs/ai-gateway/models-and-providers)
- [OpenRouter AI SDK provider](https://ai-sdk.dev/providers/community-providers/openrouter)
