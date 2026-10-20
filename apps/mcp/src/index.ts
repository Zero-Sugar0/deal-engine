import { createInterface } from 'node:readline';

const apiUrl = process.env.DEAL_API_URL ?? 'https://deal-engine.up.railway.app';
const apiKey = process.env.DEAL_API_KEY ?? 'local-agent-key';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const tools = [
  {
    name: 'deal_get_context',
    description:
      'Get a signed, scoped human context packet for the current task.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        requestedCapabilities: { type: 'array', items: { type: 'string' } },
        taskMetadata: { type: 'object' },
        conversationId: { type: 'string' },
        channel: { type: 'string' },
        audience: { type: 'string' },
        activeTopic: { type: 'string' },
        userIntent: { type: 'string' },
      },
      required: ['task'],
    },
  },
  {
    name: 'deal_check_permission',
    description:
      'Evaluate whether a proposed action is allowed, requires approval, should escalate, or must be denied.',
    inputSchema: {
      type: 'object',
      properties: {
        contextPacketId: { type: 'string' },
        action: { type: 'string' },
        resource: { type: 'string' },
        recipientCount: { type: 'number' },
        spendUsd: { type: 'number' },
        irreversible: { type: 'boolean' },
        confidence: { type: 'number' },
        sensitiveFields: { type: 'array', items: { type: 'string' } },
      },
      required: ['contextPacketId', 'action'],
    },
  },
  {
    name: 'deal_request_approval',
    description:
      'Create a human approval request bound to an exact action payload.',
    inputSchema: {
      type: 'object',
      properties: {
        contextPacketId: { type: 'string' },
        action: { type: 'string' },
        summary: { type: 'string' },
        payload: {},
      },
      required: ['contextPacketId', 'action', 'summary', 'payload'],
    },
  },
  {
    name: 'deal_consume_approval',
    description:
      'Consume a granted approval once, verifying the exact approved payload and returning a short-lived execution token.',
    inputSchema: {
      type: 'object',
      properties: { approvalId: { type: 'string' }, payload: {} },
      required: ['approvalId', 'payload'],
    },
  },
  {
    name: 'deal_verify_execution',
    description:
      'Verify a short-lived execution token immediately before a side effect.',
    inputSchema: {
      type: 'object',
      properties: {
        executionToken: { type: 'string' },
        action: { type: 'string' },
        payload: {},
      },
      required: ['executionToken', 'action', 'payload'],
    },
  },
  {
    name: 'deal_remember',
    description: 'Store a durable memory or user correction.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        content: {},
        source: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['kind', 'content'],
    },
  },
  {
    name: 'deal_report_outcome',
    description:
      'Record an outcome so the context layer can improve over time.',
    inputSchema: {
      type: 'object',
      properties: {
        contextPacketId: { type: 'string' },
        outcome: { type: 'object' },
      },
      required: ['contextPacketId', 'outcome'],
    },
  },
  {
    name: 'deal_start_conversation',
    description:
      'Start a durable human-agent conversation so future context can preserve continuity.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        channel: { type: 'string' },
        audience: { type: 'string' },
        summary: { type: 'string' },
        activeTopic: { type: 'string' },
        openLoops: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'deal_add_conversation_turn',
    description: 'Persist a human or agent turn into an existing conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        content: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['conversationId', 'content'],
    },
  },
  {
    name: 'deal_feedback_context',
    description:
      'Tell DEAL whether context was helpful and record a human correction when needed.',
    inputSchema: {
      type: 'object',
      properties: {
        contextPacketId: { type: 'string' },
        rating: { type: 'string', enum: ['helpful', 'mixed', 'unhelpful'] },
        correction: { type: 'string' },
        whatWorked: { type: 'string' },
        whatToChange: { type: 'string' },
      },
      required: ['contextPacketId', 'rating'],
    },
  },
  {
    name: 'deal_start_workflow',
    description: 'Start a bounded expert workflow for the current delegation.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        goal: { type: 'string' },
        contextPacketId: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'deal_transition_workflow',
    description: 'Advance a workflow through its bounded playbook.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        step: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['workflowId', 'step'],
    },
  },
];

async function callApi(
  path: string,
  payload: unknown,
  method: 'GET' | 'POST' = 'POST',
): Promise<unknown> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ?? `DEAL API request failed: ${response.status}`,
    );
  return body;
}

function reply(id: JsonRpcRequest['id'], result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function failure(id: JsonRpcRequest['id'], message: string): void {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } })}\n`,
  );
}

async function handle(message: JsonRpcRequest): Promise<void> {
  if (
    (message.id === undefined || message.id === null) &&
    message.method?.startsWith('notifications/')
  )
    return;
  try {
    switch (message.method) {
      case 'initialize':
        return reply(message.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'deal-mcp', version: '0.1.0' },
        });
      case 'tools/list':
        return reply(message.id, { tools });
      case 'tools/call': {
        const name = String(message.params?.name ?? '');
        const args = (message.params?.arguments ?? {}) as Record<
          string,
          unknown
        >;
        const routes: Record<string, string> = {
          deal_get_context: '/v1/context',
          deal_check_permission: '/v1/policy/evaluate',
          deal_request_approval: '/v1/approvals',
          deal_consume_approval: `/v1/approvals/${String(args.approvalId ?? '')}/consume`,
          deal_verify_execution: '/v1/actions/verify',
          deal_remember: '/v1/memory',
          deal_report_outcome: '/v1/memory/outcomes',
          deal_start_conversation: '/v1/conversations',
          deal_add_conversation_turn: `/v1/conversations/${String(args.conversationId ?? '')}/turns`,
          deal_feedback_context: '/v1/context/feedback',
          deal_start_workflow: '/v1/workflows',
          deal_transition_workflow: `/v1/workflows/${String(args.workflowId ?? '')}/transition`,
        };
        if (!routes[name]) throw new Error(`Unknown DEAL tool: ${name}`);
        const payload =
          name === 'deal_consume_approval' ? { payload: args.payload } : args;
        const result = await callApi(routes[name], payload);
        return reply(message.id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        });
      }
      default:
        throw new Error(`Unsupported MCP method: ${message.method}`);
    }
  } catch (cause) {
    failure(
      message.id,
      cause instanceof Error ? cause.message : 'MCP request failed',
    );
  }
}

const input = createInterface({ input: process.stdin, terminal: false });
input.on('line', (line) => {
  if (!line.trim()) return;
  void handle(JSON.parse(line) as JsonRpcRequest);
});
