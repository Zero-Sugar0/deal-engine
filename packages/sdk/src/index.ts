import type {
  HumanContextPacket,
  HumanModel,
  ProfessionProfile,
} from '@deal/core';

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

/** The hosted deal API. Users only need to provide an API key. */
export const defaultApiUrl = 'https://deal-engine.up.railway.app';

export interface DealOptions {
  apiKey: string;
  /** Optional for self-hosted deal installations. Hosted users only need an API key. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
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

export class deal {
  private readonly requestFetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(input: string | DealOptions) {
    const options = typeof input === 'string' ? { apiKey: input } : input;
    if (!options.apiKey.trim()) throw new Error('deal API key is required');
    this.options = options;
    this.baseUrl = (
      options.baseUrl ??
      readEnvironmentApiUrl() ??
      defaultApiUrl
    ).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.requestFetch = options.fetch ?? fetch;
  }

  private readonly options: DealOptions;

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.requestFetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    let body: (T & { error?: string }) | undefined;
    try {
      body = (await response.json()) as T & { error?: string };
    } catch {
      body = undefined;
    }
    if (!response.ok)
      throw new Error(
        body?.error ?? `deal request failed with ${response.status}`,
      );
    return body as T;
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

  async listProfessions(
    input: {
      search?: string;
      category?: string;
    } = {},
  ): Promise<ProfessionProfile[]> {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    if (input.category) params.set('category', input.category);
    const query = params.toString();
    return this.request(`/v1/professions${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  }

  async getProfession(professionId: string): Promise<ProfessionProfile> {
    return this.request(`/v1/professions/${encodeURIComponent(professionId)}`, {
      method: 'GET',
    });
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

function readEnvironmentApiUrl(): string | undefined {
  const processLike = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  const value = processLike?.env?.DEAL_API_URL;
  return value?.trim() || undefined;
}

/** Construct a hosted client without repeating the API endpoint in application code. */
export function createDealClient(
  apiKey: string,
  options: Omit<DealOptions, 'apiKey'> = {},
): deal {
  return new deal({ ...options, apiKey });
}
