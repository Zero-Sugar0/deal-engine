import type { HumanContextPacket, HumanModel } from '@deal/core';

export * from './agent.js';
export * from './integrations.js';

export type HumanProfile = {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  role: string;
  modelVersion: number;
} & Pick<
  HumanModel,
  | 'identity'
  | 'persona'
  | 'selfConcept'
  | 'biography'
  | 'relationships'
  | 'relational'
  | 'boundaries'
  | 'domain'
  | 'decision'
  | 'behavior'
  | 'currentPriorities'
  | 'knownConstraints'
>;

export type HumanProfileUpdate = {
  displayName?: string;
  role?: string;
  identity?: Partial<HumanModel['identity']>;
  persona?: Partial<HumanModel['persona']>;
  selfConcept?: Partial<HumanModel['selfConcept']>;
  biography?: Partial<HumanModel['biography']>;
  relationships?: HumanModel['relationships'];
  relational?: Partial<HumanModel['relational']>;
  boundaries?: Partial<HumanModel['boundaries']>;
  domain?: Partial<HumanModel['domain']>;
  decision?: Partial<HumanModel['decision']>;
  behavior?: Partial<HumanModel['behavior']>;
  currentPriorities?: string[];
  knownConstraints?: string[];
};

export interface DEALOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export interface ContextRequest {
  task: string;
  requestedCapabilities?: string[];
  taskMetadata?: Record<string, unknown>;
  conversationId?: string;
  channel?: string;
  audience?: string;
  activeTopic?: string;
  userIntent?: string;
}

export interface Conversation {
  id: string;
  humanId: string;
  agentId: string;
  title?: string;
  channel?: string;
  audience?: string;
  summary?: string;
  activeTopic?: string;
  openLoops: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: 'human' | 'agent' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PolicyRequest {
  contextPacketId: string;
  action: string;
  resource?: string;
  recipientCount?: number;
  spendUsd?: number;
  irreversible?: boolean;
  confidence?: number;
  sensitiveFields?: string[];
}

export interface WorkflowRun {
  id: string;
  humanId: string;
  agentId: string;
  profileId: string;
  goal: string;
  currentStep: string;
  contextPacketId?: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class DEAL {
  private readonly requestFetch: typeof fetch;

  constructor(private readonly options: DEALOptions) {
    this.requestFetch = options.fetch ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestFetch(
      `${this.options.baseUrl.replace(/\/$/, '')}${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      },
    );
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok)
      throw new Error(
        body.error ?? `DEAL request failed with ${response.status}`,
      );
    return body;
  }

  async getContext(input: ContextRequest): Promise<{
    packetId: string;
    packet: HumanContextPacket;
    signature: string;
  }> {
    return this.request('/v1/context', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getProfile(): Promise<{
    human: HumanProfile;
    delegations: Array<Record<string, unknown>>;
  }> {
    return this.request('/v1/profile', { method: 'GET' });
  }

  async updateProfile(input: HumanProfileUpdate): Promise<HumanProfile> {
    return this.request('/v1/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async completeOnboarding(input: HumanProfileUpdate): Promise<HumanProfile> {
    return this.request('/v1/onboarding', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getContextPacket(packetId: string): Promise<{
    packetId: string;
    packet: HumanContextPacket;
    signature: string;
    expired: boolean;
  }> {
    return this.request(`/v1/context/${packetId}`);
  }

  async startConversation(input: {
    title?: string;
    channel?: string;
    audience?: string;
    summary?: string;
    activeTopic?: string;
    openLoops?: string[];
  }): Promise<Conversation> {
    return this.request('/v1/conversations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listConversations(): Promise<Conversation[]> {
    return this.request('/v1/conversations');
  }

  async addConversationTurn(
    conversationId: string,
    input: { content: string; metadata?: Record<string, unknown> },
  ): Promise<ConversationTurn> {
    return this.request(`/v1/conversations/${conversationId}/turns`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listConversationTurns(
    conversationId: string,
  ): Promise<ConversationTurn[]> {
    return this.request(`/v1/conversations/${conversationId}/turns`);
  }

  async giveContextFeedback(input: {
    contextPacketId: string;
    rating: 'helpful' | 'mixed' | 'unhelpful';
    correction?: string;
    whatWorked?: string;
    whatToChange?: string;
  }): Promise<{ feedback: Record<string, unknown>; memoryId?: string }> {
    return this.request('/v1/context/feedback', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listContextFeedback(): Promise<
    Array<{
      id: string;
      contextPacketId: string;
      rating: 'helpful' | 'mixed' | 'unhelpful';
      correction?: string;
      whatWorked?: string;
      whatToChange?: string;
      createdAt: string;
    }>
  > {
    return this.request('/v1/context/feedback');
  }

  async checkPermission(input: PolicyRequest): Promise<{
    decision:
      | 'allow'
      | 'allow_with_redaction'
      | 'require_approval'
      | 'escalate'
      | 'deny';
    reason: string;
    matchedRules: string[];
    redactions: string[];
    risk: string;
  }> {
    return this.request('/v1/policy/evaluate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async requestApproval(input: {
    contextPacketId: string;
    action: string;
    summary: string;
    payload: unknown;
    resource?: string;
    recipientCount?: number;
    spendUsd?: number;
    irreversible?: boolean;
    confidence?: number;
    sensitiveFields?: string[];
  }): Promise<unknown> {
    return this.request('/v1/approvals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async consumeApproval(
    approvalId: string,
    payload: unknown,
  ): Promise<{
    approvalId: string;
    action: string;
    payloadHash: string;
    executionToken: string;
  }> {
    return this.request(`/v1/approvals/${approvalId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  }

  async verifyExecution(input: {
    executionToken: string;
    action: string;
    payload: unknown;
  }): Promise<{
    authorized: boolean;
    approvalId: string;
    action: string;
    payloadHash: string;
  }> {
    return this.request('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async createWorkflow(input: {
    profileId?: string;
    goal: string;
    contextPacketId?: string;
    data?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    return this.request('/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listWorkflows(): Promise<WorkflowRun[]> {
    return this.request('/v1/workflows');
  }

  async transitionWorkflow(
    workflowId: string,
    step: string,
    data: Record<string, unknown> = {},
  ): Promise<WorkflowRun> {
    return this.request(`/v1/workflows/${workflowId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ step, data }),
    });
  }

  async remember(input: {
    kind: string;
    content: string | Record<string, unknown>;
    source?: string;
    confidence?: number;
    confirmation?: 'user_confirmed' | 'agent_observed' | 'inferred';
    priority?: number;
    sensitivity?: 'normal' | 'personal' | 'sensitive';
  }): Promise<{ id: string }> {
    return this.request('/v1/memory', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async reportOutcome(input: {
    contextPacketId: string;
    outcome: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.request('/v1/memory/outcomes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
