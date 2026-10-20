import { createHash, randomBytes } from 'node:crypto';
import type {
  Authority,
  Biography,
  BoundaryProfile,
  BehavioralContract,
  DecisionStyle,
  DomainContext,
  HumanContextPacket,
  IdentityProfile,
  JudgmentRules,
  MemoryRecord,
  Persona,
  RelationshipContext,
  RelationalProfile,
  SelfConcept,
  SkillRegistryEntry as CoreSkillRegistryEntry,
} from '@deal/core';
import { InMemoryAdapter } from '@deal/memory';
import type { MemoryAdapter } from '@deal/memory';
import type { PolicyResult, PolicyRule } from '@deal/policy';

export type SkillRegistryEntry = CoreSkillRegistryEntry;

export interface Human {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  role: string;
  identity: IdentityProfile;
  persona: Persona;
  selfConcept: SelfConcept;
  biography: Biography;
  relationships: RelationshipContext[];
  relational: RelationalProfile;
  boundaries: BoundaryProfile;
  domain: DomainContext;
  decision: DecisionStyle;
  behavior: BehavioralContract;
  currentPriorities: string[];
  knownConstraints: string[];
  modelVersion: number;
  judgment: JudgmentRules;
  onboarding?: OnboardingProfile;
}

export interface OnboardingProfile {
  role?: string;
  focus?: string;
  referralSource?: string;
  completedAt?: string;
}

export interface Agent {
  id: string;
  name: string;
  runtime: string;
  ownerHumanId: string;
  status: 'active' | 'suspended';
}

export interface Delegation {
  id: string;
  humanId: string;
  agentId: string;
  purpose: string;
  authority: Authority;
  policyRules: PolicyRule[];
  profileId?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface Credential {
  id: string;
  tokenHash: string;
  kind: 'agent' | 'human';
  humanId: string;
  agentId?: string;
  name?: string;
  createdAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface AiGatewayCredential {
  id: string;
  humanId: string;
  provider: 'vercel_ai_gateway';
  encryptedApiKey: string;
  keyHint: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface ContextRecord {
  packet: HumanContextPacket;
  signature: string;
  humanId: string;
  agentId: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  humanId: string;
  agentId: string;
  contextPacketId: string;
  action: string;
  summary: string;
  payload: unknown;
  payloadHash: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  consumedAt?: string;
  policyResult?: PolicyResult;
}

export interface AuditEvent {
  id: string;
  humanId: string;
  organizationId: string;
  agentId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export type WorkflowStep =
  | 'intake'
  | 'research'
  | 'qualify'
  | 'dedupe'
  | 'draft'
  | 'review'
  | 'approval'
  | 'send'
  | 'track'
  | 'report'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface WorkflowRun {
  id: string;
  humanId: string;
  agentId: string;
  profileId: string;
  goal: string;
  currentStep: WorkflowStep;
  contextPacketId?: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export interface ContextFeedback {
  id: string;
  humanId: string;
  agentId: string;
  contextPacketId: string;
  rating: 'helpful' | 'mixed' | 'unhelpful';
  correction?: string;
  whatWorked?: string;
  whatToChange?: string;
  createdAt: string;
}

export interface ExternalIdentity {
  id: string;
  organizationId: string;
  humanId: string;
  issuer: string;
  subject: string;
  email?: string;
  claims: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export class DealStore {
  readonly ready: Promise<void>;
  readonly memories: MemoryAdapter;
  readonly humans = new Map<string, Human>();
  readonly agents = new Map<string, Agent>();
  readonly delegations = new Map<string, Delegation>();
  readonly credentials = new Map<string, Credential>();
  readonly aiGatewayCredentials = new Map<string, AiGatewayCredential>();
  readonly contexts = new Map<string, ContextRecord>();
  readonly approvals = new Map<string, Approval>();
  readonly audits: AuditEvent[] = [];
  readonly workflows = new Map<string, WorkflowRun>();
  readonly conversations = new Map<string, Conversation>();
  readonly conversationTurns = new Map<string, ConversationTurn[]>();
  readonly feedback = new Map<string, ContextFeedback>();
  readonly externalIdentities = new Map<string, ExternalIdentity>();
  readonly skillRegistry = new Map<string, SkillRegistryEntry>();
  readonly forgottenMemoryIds = new Set<string>();

  constructor(memoryAdapter: MemoryAdapter = new InMemoryAdapter()) {
    this.memories = memoryAdapter;
    this.ready = Promise.resolve();
  }

  async persist(): Promise<void> {}

  async beginRequest(_requestId: string): Promise<void> {}

  async endRequest(_requestId: string): Promise<void> {
    await this.persist();
  }

  async health(): Promise<{ ok: boolean; durable: boolean; provider: string }> {
    return { ok: true, durable: false, provider: 'memory' };
  }

  async close(): Promise<void> {}

  issueCredential(
    input: Omit<Credential, 'id' | 'tokenHash'>,
    requestedToken?: string,
  ): string {
    const token =
      requestedToken ?? `deal_${randomBytes(24).toString('base64url')}`;
    const credential = {
      ...input,
      id: crypto.randomUUID(),
      tokenHash: hashToken(token),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.credentials.set(credential.id, credential);
    return token;
  }

  authenticate(token: string): Credential | undefined {
    const credential = [...this.credentials.values()].find(
      (item) => item.tokenHash === hashToken(token),
    );
    if (credential?.revokedAt) return undefined;
    if (credential?.expiresAt && new Date(credential.expiresAt) <= new Date())
      return undefined;
    return credential;
  }

  getActiveAiGatewayCredential(
    humanId: string,
  ): AiGatewayCredential | undefined {
    return [...this.aiGatewayCredentials.values()]
      .filter(
        (credential) => credential.humanId === humanId && !credential.revokedAt,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  findExternalIdentity(
    issuer: string,
    subject: string,
  ): ExternalIdentity | undefined {
    return this.externalIdentities.get(`${issuer}\n${subject}`);
  }

  findHumanByExternalIdentity(
    issuer: string,
    subject: string,
  ): Human | undefined {
    const identity = this.findExternalIdentity(issuer, subject);
    return identity ? this.humans.get(identity.humanId) : undefined;
  }

  static skillKey(
    organizationId: string,
    name: string,
    version: string,
  ): string {
    return `${organizationId}\n${name}\n${version}`;
  }

  findSkill(
    organizationId: string,
    name: string,
    version: string,
  ): SkillRegistryEntry | undefined {
    return this.skillRegistry.get(
      DealStore.skillKey(organizationId, name, version),
    );
  }

  linkExternalIdentity(
    input: Omit<ExternalIdentity, 'id' | 'createdAt' | 'updatedAt'>,
  ): ExternalIdentity {
    const key = `${input.issuer}\n${input.subject}`;
    const existing = this.externalIdentities.get(key);
    if (existing && existing.humanId !== input.humanId)
      throw new Error('External identity is already linked to another human');
    const now = new Date().toISOString();
    const identity: ExternalIdentity = {
      ...input,
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.externalIdentities.set(key, identity);
    return identity;
  }

  recordAudit(input: Omit<AuditEvent, 'id' | 'occurredAt'>): AuditEvent {
    const event = {
      ...input,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    this.audits.push(event);
    return event;
  }

  getDelegationForAgent(
    agentId: string,
    humanId: string,
  ): Delegation | undefined {
    return [...this.delegations.values()].find(
      (delegation) =>
        delegation.agentId === agentId &&
        delegation.humanId === humanId &&
        !delegation.revokedAt &&
        (!delegation.expiresAt ||
          new Date(delegation.expiresAt) > new Date()) &&
        (!delegation.authority.expiresAt ||
          new Date(delegation.authority.expiresAt) > new Date()),
    );
  }

  async seedDemo(agentToken: string, humanToken: string): Promise<void> {
    const human: Human = {
      id: 'human_demo',
      email: 'founder@example.com',
      displayName: 'Demo Founder',
      organizationId: 'org_demo',
      role: 'Founder',
      identity: {
        preferredName: 'Founder',
        mission: 'Build a durable, trusted company',
        organization: 'Demo Organization',
        locale: 'en',
        timezone: 'UTC',
        languages: [],
        identityMarkers: [],
        affiliations: [],
        accessibilityNeeds: [],
      },
      persona: {
        displayName: 'Demo Founder',
        role: 'Founder',
        communicationStyle: 'direct, concise, evidence-led',
        directness: 0.85,
        warmth: 0.45,
        verbosity: 'concise',
        structure: 'mixed',
        tone: 'direct',
        preferredPhrases: [],
        avoidedPhrases: ['hype', 'vague promises'],
        values: ['quality', 'privacy', 'qualified meetings over volume'],
        riskTolerance: 'low',
        language: 'en',
        formattingPreferences: [
          'Use short paragraphs',
          'Use bullets for multiple options',
        ],
        examples: [],
        modes: [],
      },
      selfConcept: {
        summary:
          'A careful builder who values durable trust over performative growth.',
        identityStatements: [
          {
            value: 'I am a founder who prefers substance over status.',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        strengths: [
          {
            value: 'evidence-led judgment',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        nonNegotiables: [
          {
            value: 'do not trade trust for short-term metrics',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        valuesHierarchy: [
          { value: 'quality', priority: 100 },
          { value: 'privacy', priority: 95 },
          { value: 'durable trust', priority: 90 },
        ],
        growthEdges: [],
        aspirations: [],
        fears: [],
        howTheyDescribeThemselves: ['direct', 'careful', 'evidence-led'],
      },
      biography: {
        summary: 'Founder building a durable B2B company.',
        currentChapter:
          'Turning early traction into a trusted operating system.',
        formativeExperiences: [],
        careerArc: [],
        places: [],
        languages: [],
        domainExpertise: [],
        lifeContext: [],
      },
      relationships: [],
      relational: {
        trustSignals: [],
        trustBreakers: [
          {
            value: 'hype or unsupported certainty',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        calmingFactors: [
          {
            value: 'a clear summary followed by evidence and options',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        frustrationTriggers: [],
        sensitiveTopics: [],
        acknowledgmentPreferences: [
          'acknowledge the tradeoff before recommending a path',
        ],
        encouragementPreferences: [],
        conflictPreferences: [
          'challenge the reasoning respectfully and concretely',
        ],
        repairProtocol: [
          'admit the mistake, state what changed, and propose the correction',
        ],
        emotionalContextNotes: [],
      },
      boundaries: {
        neverAssume: [
          'consent to a consequential action',
          'certainty from an inference',
        ],
        mustAsk: [
          'before an external commitment',
          'when a material ambiguity remains',
        ],
        neverMention: [],
        neverInfer: ['sensitive identity attributes'],
        sensitiveTopics: [],
        consentRules: [
          'explicit approval is required for consequential commitments',
        ],
        protectedAttributes: [],
        privacyPreferences: [
          'minimize personal detail unless it improves the task',
        ],
      },
      domain: {
        business: 'B2B HR SaaS',
        icp: 'HR leaders at US companies with 50-500 employees',
        offer: 'A workflow platform that reduces manual HR operations',
        jurisdictions: [],
        exclusions: ['agencies', 'current customers', 'suppressed contacts'],
        goals: ['book qualified meetings', 'improve reply quality'],
        terminology: {
          qualifiedMeeting: 'A meeting with an ICP decision-maker',
        },
      },
      decision: {
        priorities: ['quality', 'privacy', 'qualified meetings over volume'],
        tradeoffs: ['prefer durable trust over short-term growth'],
        riskTolerance: 'low',
        reversibilityPreference: 'reversible_first',
        asksBeforeCommitment: ['external commitments', 'mass communication'],
        confidenceFloor: 0.7,
        northStars: ['durable trust', 'qualified outcomes'],
        timeHorizon: 'multi_year',
        defaultStance: 'cautious',
        evidenceThreshold: 0.7,
        decisionProcess: [
          'state the tradeoff',
          'prefer reversible tests',
          'review evidence',
        ],
        autonomyPreferences: ['draft freely', 'ask before commitment'],
        escalationTriggers: [
          'legal or reputational exposure',
          'material ambiguity',
        ],
        redLines: ['deception', 'unauthorized use of personal data'],
        heuristics: ['quality over volume', 'trust compounds'],
        examples: [],
      },
      behavior: {
        relationship: 'representative',
        speakAs: 'representative',
        discloseAgentIdentity: true,
        whenUncertain: 'ask',
        whenDisagreeing: 'challenge_respectfully',
        whenWrong: 'admit_and_correct',
        askBefore: [
          'crossing a stated boundary',
          'making a consequential commitment',
        ],
        neverClaim: [
          'work not performed',
          'certainty not supported by evidence',
        ],
        neverDo: [
          'use hype',
          'repeat a rejected approach without new evidence',
        ],
        responsePrinciples: [
          'be direct, concise, and evidence-led',
          'preserve the founder’s priorities',
        ],
        refusalStyle: 'offer_safe_alternative',
        preserveHumanVoice: true,
        neverImpersonate: true,
      },
      currentPriorities: ['book qualified meetings', 'improve reply quality'],
      knownConstraints: [
        'agencies',
        'current customers',
        'suppressed contacts',
      ],
      modelVersion: 1,
      judgment: {
        askIfMissing: ['audience', 'goal', 'tone'],
        escalateIf: ['legal claim', 'financial commitment', 'mass send'],
        refuseIf: ['deceptive outreach', 'unauthorized data use'],
        confidenceThreshold: 0.7,
      },
    };
    this.humans.set(human.id, human);
    const agent: Agent = {
      id: 'agent_demo',
      name: 'Demo Growth Agent',
      runtime: 'mcp',
      ownerHumanId: human.id,
      status: 'active',
    };
    this.agents.set(agent.id, agent);
    const delegation: Delegation = {
      id: 'delegation_demo',
      humanId: human.id,
      agentId: agent.id,
      purpose: 'Run bounded Growth Operator workflows',
      authority: {
        mayRead: ['context_read', 'memory_read'],
        mayDraft: ['response_draft'],
        mayWrite: ['memory_write', 'external_commitment'],
        requiresApproval: ['external_commitment'],
      },
      policyRules: [
        {
          id: 'large_external_commitment',
          action: 'external_commitment',
          recipientCountGt: 50,
          decision: 'require_approval',
          reason: 'Large external commitments require explicit approval',
        },
      ],
      profileId: 'growth_operator_v1',
    };
    this.delegations.set(delegation.id, delegation);
    this.issueCredential(
      { kind: 'agent', humanId: human.id, agentId: agent.id },
      agentToken,
    );
    this.issueCredential({ kind: 'human', humanId: human.id }, humanToken);
    await this.memories.add({
      humanId: human.id,
      organizationId: human.organizationId,
      kind: 'preference',
      content: 'Prefer concise, direct messaging with evidence over hype',
      source: 'user_confirmed',
      confirmation: 'user_confirmed',
      priority: 90,
    });
    await this.memories.add({
      humanId: human.id,
      organizationId: human.organizationId,
      kind: 'correction',
      content: 'Never target agencies or current customers',
      source: 'user_confirmed',
      confirmation: 'user_confirmed',
      priority: 100,
    });
  }
}
