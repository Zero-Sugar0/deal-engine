import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  BehavioralContractSchema,
  BiographySchema,
  BoundaryProfileSchema,
  compileHumanContextPacket,
  DecisionStyleSchema,
  DomainContextSchema,
  HumanModelSchema,
  IdentityProfileSchema,
  JudgmentRulesSchema,
  PersonaSchema,
  RelationshipContextSchema,
  RelationalProfileSchema,
  SelfConceptSchema,
} from '@deal/core';
import type { Grounding, InteractionContext, MemoryContext } from '@deal/core';
import type { HumanModel, ProfileFact } from '@deal/core';
import { evaluatePolicy } from '@deal/policy';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { DealStore, hashPayload, type Credential } from './store.js';
import {
  getExpertProfile,
  profileRegistry,
  missingProfileContext,
} from './profiles.js';
import type { WorkflowStep } from './store.js';

export interface ServerOptions {
  store?: DealStore;
  jwtSecret?: string;
  contextTtlMinutes?: number;
}

const contextBody = z.object({
  task: z.string().min(1),
  requestedCapabilities: z.array(z.string()).default([]),
  taskMetadata: z.record(z.unknown()).default({}),
  conversationId: z.string().optional(),
  channel: z.string().optional(),
  audience: z.string().optional(),
  activeTopic: z.string().optional(),
  userIntent: z.string().optional(),
});

const policyBody = z.object({
  action: z.string().min(1),
  resource: z.string().optional(),
  recipientCount: z.number().int().nonnegative().optional(),
  spendUsd: z.number().nonnegative().optional(),
  irreversible: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sensitiveFields: z.array(z.string()).optional(),
  contextPacketId: z.string(),
});

function error(
  statusCode: number,
  message: string,
): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) throw error(401, 'Bearer token required');
  return value.slice('Bearer '.length);
}

function requireCredential(
  store: DealStore,
  request: FastifyRequest,
  kind?: Credential['kind'],
): Credential {
  const credential = store.authenticate(bearer(request));
  if (!credential) throw error(401, 'Invalid or revoked credential');
  if (kind && credential.kind !== kind)
    throw error(403, `${kind} credential required`);
  if (
    credential.agentId &&
    store.agents.get(credential.agentId)?.status !== 'active'
  )
    throw error(403, 'Agent is suspended or unavailable');
  return credential;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw error(
      400,
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  return result.data;
}

function keyFromSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret.padEnd(32, '0'));
}

function memoryText(content: string | Record<string, unknown>): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function visibleFacts(
  facts: ProfileFact[],
  includeSensitiveContext: boolean,
): ProfileFact[] {
  return includeSensitiveContext
    ? facts
    : facts.filter((fact) => fact.sensitivity !== 'sensitive');
}

function scopeHumanModel(
  model: HumanModel,
  includeSensitiveContext: boolean,
): { model: HumanModel; redactions: string[] } {
  if (includeSensitiveContext) return { model, redactions: [] };
  const redactions: string[] = [];
  const scoped = (path: string, facts: ProfileFact[]): ProfileFact[] => {
    const visible = visibleFacts(facts, false);
    if (visible.length !== facts.length) redactions.push(path);
    return visible;
  };
  const identity = {
    ...model.identity,
    languages: scoped(
      'humanModel.identity.languages',
      model.identity.languages,
    ),
    identityMarkers: scoped(
      'humanModel.identity.identityMarkers',
      model.identity.identityMarkers,
    ),
    affiliations: scoped(
      'humanModel.identity.affiliations',
      model.identity.affiliations,
    ),
    accessibilityNeeds: scoped(
      'humanModel.identity.accessibilityNeeds',
      model.identity.accessibilityNeeds,
    ),
    legalName: undefined,
  };
  if (model.identity.legalName)
    redactions.push('humanModel.identity.legalName');
  const selfConcept = {
    ...model.selfConcept,
    identityStatements: scoped(
      'humanModel.selfConcept.identityStatements',
      model.selfConcept.identityStatements,
    ),
    strengths: scoped(
      'humanModel.selfConcept.strengths',
      model.selfConcept.strengths,
    ),
    growthEdges: scoped(
      'humanModel.selfConcept.growthEdges',
      model.selfConcept.growthEdges,
    ),
    aspirations: scoped(
      'humanModel.selfConcept.aspirations',
      model.selfConcept.aspirations,
    ),
    fears: scoped('humanModel.selfConcept.fears', model.selfConcept.fears),
    nonNegotiables: scoped(
      'humanModel.selfConcept.nonNegotiables',
      model.selfConcept.nonNegotiables,
    ),
  };
  const biography = {
    ...model.biography,
    formativeExperiences: scoped(
      'humanModel.biography.formativeExperiences',
      model.biography.formativeExperiences,
    ),
    places: scoped('humanModel.biography.places', model.biography.places),
    languages: scoped(
      'humanModel.biography.languages',
      model.biography.languages,
    ),
    domainExpertise: scoped(
      'humanModel.biography.domainExpertise',
      model.biography.domainExpertise,
    ),
    lifeContext: scoped(
      'humanModel.biography.lifeContext',
      model.biography.lifeContext,
    ),
  };
  const relational = {
    ...model.relational,
    trustSignals: scoped(
      'humanModel.relational.trustSignals',
      model.relational.trustSignals,
    ),
    trustBreakers: scoped(
      'humanModel.relational.trustBreakers',
      model.relational.trustBreakers,
    ),
    calmingFactors: scoped(
      'humanModel.relational.calmingFactors',
      model.relational.calmingFactors,
    ),
    frustrationTriggers: scoped(
      'humanModel.relational.frustrationTriggers',
      model.relational.frustrationTriggers,
    ),
    sensitiveTopics: scoped(
      'humanModel.relational.sensitiveTopics',
      model.relational.sensitiveTopics,
    ),
    emotionalContextNotes: scoped(
      'humanModel.relational.emotionalContextNotes',
      model.relational.emotionalContextNotes,
    ),
  };
  const relationships = model.relationships.filter((relationship) => {
    if (relationship.sensitivity !== 'sensitive') return true;
    redactions.push(`humanModel.relationships.${relationship.id}`);
    return false;
  });
  return {
    model: {
      ...model,
      identity,
      selfConcept,
      biography,
      relational,
      relationships,
    },
    redactions,
  };
}

const workflowTransitions: Partial<Record<WorkflowStep, WorkflowStep>> = {
  intake: 'research',
  research: 'qualify',
  qualify: 'dedupe',
  dedupe: 'draft',
  draft: 'review',
  review: 'approval',
  approval: 'send',
  send: 'track',
  track: 'report',
  report: 'completed',
};

export function buildServer(
  options: ServerOptions = {},
): FastifyInstance & { dealStore: DealStore } {
  const store = options.store ?? new DealStore();
  const configuredJwtSecret = options.jwtSecret ?? process.env.DEAL_JWT_SECRET;
  if (
    process.env.NODE_ENV === 'production' &&
    (!configuredJwtSecret || configuredJwtSecret.length < 32)
  )
    throw new Error(
      'DEAL_JWT_SECRET must be configured with at least 32 characters in production',
    );
  const jwtSecret = configuredJwtSecret ?? 'dev-secret-change-me-at-least-32';
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.DEAL_DASHBOARD_ORIGIN
  )
    throw new Error('DEAL_DASHBOARD_ORIGIN must be configured in production');
  const contextTtlMinutes =
    options.contextTtlMinutes ??
    Number(process.env.DEAL_CONTEXT_TTL_MINUTES ?? 15);
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
    bodyLimit: 1_048_576,
  }) as unknown as FastifyInstance & { dealStore: DealStore };
  app.decorate('dealStore', store);
  app.addHook('onRequest', async () => {
    await store.ready;
  });
  app.addHook('onRequest', async (request, reply) => {
    const origin = process.env.DEAL_DASHBOARD_ORIGIN ?? '*';
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    reply.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.addHook('onResponse', async () => {
    await store.persist();
  });

  app.get('/healthz', async () => ({ status: 'ok', service: 'deal-api' }));

  app.post('/v1/agents', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const body = parse(
      z.object({
        name: z.string().min(1),
        runtime: z.string().min(1),
        credentialExpiresAt: z.string().datetime().optional(),
      }),
      request.body,
    );
    const agent = {
      id: crypto.randomUUID(),
      name: body.name,
      runtime: body.runtime,
      ownerHumanId: credential.humanId,
      status: 'active' as const,
    };
    store.agents.set(agent.id, agent);
    const apiKey = store.issueCredential({
      kind: 'agent',
      humanId: credential.humanId,
      agentId: agent.id,
      expiresAt: body.credentialExpiresAt,
    });
    store.recordAudit({
      humanId: credential.humanId,
      organizationId:
        store.humans.get(credential.humanId)?.organizationId ?? '',
      agentId: agent.id,
      eventType: 'agent.created',
      payload: { agentId: agent.id },
    });
    return { agent, apiKey };
  });

  app.post('/v1/agents/:agentId/credentials/rotate', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { agentId: string };
    const body = parse(
      z.object({ credentialExpiresAt: z.string().datetime().optional() }),
      request.body,
    );
    const agent = store.agents.get(params.agentId);
    if (!agent || agent.ownerHumanId !== credential.humanId)
      throw error(404, 'Agent not found');
    for (const item of store.credentials.values()) {
      if (item.agentId === agent.id && !item.revokedAt)
        item.revokedAt = new Date().toISOString();
    }
    const apiKey = store.issueCredential({
      kind: 'agent',
      humanId: credential.humanId,
      agentId: agent.id,
      expiresAt: body.credentialExpiresAt,
    });
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: agent.id,
      eventType: 'credential.rotated',
      payload: { agentId: agent.id },
    });
    return { agentId: agent.id, apiKey, expiresAt: body.credentialExpiresAt };
  });

  app.post('/v1/credentials/:credentialId/revoke', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { credentialId: string };
    const target = store.credentials.get(params.credentialId);
    if (!target || target.humanId !== credential.humanId)
      throw error(404, 'Credential not found');
    target.revokedAt = new Date().toISOString();
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: target.agentId,
      eventType: 'credential.revoked',
      payload: { credentialId: target.id },
    });
    return { credentialId: target.id, revoked: true };
  });

  app.post('/v1/delegations', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const body = parse(
      z.object({
        agentId: z.string(),
        purpose: z.string().min(1),
        authority: z.object({
          mayRead: z.array(z.string()).default([]),
          mayWrite: z.array(z.string()).default([]),
          mayDraft: z.array(z.string()).default([]),
          requiresApproval: z.array(z.string()).default([]),
          spendLimitUsd: z.number().nonnegative().optional(),
          maxRecipientCount: z.number().int().positive().optional(),
          expiresAt: z.string().optional(),
        }),
        profileId: z.string().optional(),
        expiresAt: z.string().optional(),
      }),
      request.body,
    );
    const agent = store.agents.get(body.agentId);
    if (!agent || agent.ownerHumanId !== credential.humanId)
      throw error(404, 'Agent not found');
    const authority = {
      mayRead: body.authority.mayRead ?? [],
      mayWrite: body.authority.mayWrite ?? [],
      mayDraft: body.authority.mayDraft ?? [],
      requiresApproval: body.authority.requiresApproval ?? [],
      spendLimitUsd: body.authority.spendLimitUsd,
      maxRecipientCount: body.authority.maxRecipientCount,
      expiresAt: body.authority.expiresAt,
    };
    const delegation = {
      id: crypto.randomUUID(),
      humanId: credential.humanId,
      agentId: body.agentId,
      purpose: body.purpose,
      authority,
      policyRules: [],
      profileId: body.profileId,
      expiresAt: body.expiresAt,
    };
    store.delegations.set(delegation.id, delegation);
    store.recordAudit({
      humanId: credential.humanId,
      organizationId:
        store.humans.get(credential.humanId)?.organizationId ?? '',
      agentId: agent.id,
      eventType: 'delegation.created',
      payload: { delegationId: delegation.id },
    });
    return delegation;
  });

  app.get('/v1/profile', async (request) => {
    // Raw profile inspection is human-owned. Agents receive the scoped,
    // audience-aware and signed model through /v1/context instead.
    const credential = requireCredential(store, request, 'human');
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    return {
      human,
      delegations: [...store.delegations.values()].filter(
        (item) => item.humanId === human.id && !item.revokedAt,
      ),
    };
  });

  app.get('/v1/profiles', async (request) => {
    requireCredential(store, request);
    return profileRegistry;
  });

  app.patch('/v1/profile', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const body = parse(
      z.object({
        displayName: z.string().min(1).optional(),
        role: z.string().optional(),
        identity: IdentityProfileSchema.partial().optional(),
        persona: PersonaSchema.partial().optional(),
        selfConcept: SelfConceptSchema.partial().optional(),
        biography: BiographySchema.partial().optional(),
        relationships: z.array(RelationshipContextSchema).optional(),
        relational: RelationalProfileSchema.partial().optional(),
        boundaries: BoundaryProfileSchema.partial().optional(),
        domain: DomainContextSchema.partial().optional(),
        decision: DecisionStyleSchema.partial().optional(),
        behavior: BehavioralContractSchema.partial().optional(),
        currentPriorities: z.array(z.string()).optional(),
        knownConstraints: z.array(z.string()).optional(),
        judgment: z.record(z.unknown()).optional(),
      }),
      request.body,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    if (body.displayName !== undefined) human.displayName = body.displayName;
    if (body.role !== undefined) human.role = body.role;
    if (body.identity)
      human.identity = IdentityProfileSchema.parse({
        ...human.identity,
        ...body.identity,
      });
    if (body.persona)
      human.persona = PersonaSchema.parse({
        ...human.persona,
        ...body.persona,
      });
    if (body.selfConcept)
      human.selfConcept = SelfConceptSchema.parse({
        ...human.selfConcept,
        ...body.selfConcept,
      });
    if (body.biography)
      human.biography = BiographySchema.parse({
        ...human.biography,
        ...body.biography,
      });
    if (body.relationships)
      human.relationships = body.relationships.map((relationship) =>
        RelationshipContextSchema.parse(relationship),
      );
    if (body.relational)
      human.relational = RelationalProfileSchema.parse({
        ...human.relational,
        ...body.relational,
      });
    if (body.boundaries)
      human.boundaries = BoundaryProfileSchema.parse({
        ...human.boundaries,
        ...body.boundaries,
      });
    if (body.domain)
      human.domain = DomainContextSchema.parse({
        ...human.domain,
        ...body.domain,
      });
    if (body.decision)
      human.decision = DecisionStyleSchema.parse({
        ...human.decision,
        ...body.decision,
      });
    if (body.behavior)
      human.behavior = BehavioralContractSchema.parse({
        ...human.behavior,
        ...body.behavior,
      });
    if (body.currentPriorities)
      human.currentPriorities = body.currentPriorities;
    if (body.knownConstraints) human.knownConstraints = body.knownConstraints;
    if (body.judgment) human.judgment = { ...human.judgment, ...body.judgment };
    human.modelVersion = (human.modelVersion ?? 1) + 1;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'profile.updated',
      payload: { fields: Object.keys(body) },
    });
    return human;
  });

  app.post('/v1/onboarding', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const body = parse(
      z.object({
        displayName: z.string().min(1).optional(),
        role: z.string().optional(),
        business: z.string().optional(),
        icp: z.string().optional(),
        offer: z.string().optional(),
        exclusions: z.array(z.string()).optional(),
        goals: z.array(z.string()).optional(),
        communicationStyle: z.string().optional(),
        values: z.array(z.string()).optional(),
        riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
        preferredName: z.string().optional(),
        pronouns: z.string().optional(),
        mission: z.string().optional(),
        organization: z.string().optional(),
        locale: z.string().optional(),
        timezone: z.string().optional(),
        identity: IdentityProfileSchema.partial().optional(),
        selfConcept: SelfConceptSchema.partial().optional(),
        biography: BiographySchema.partial().optional(),
        relationships: z.array(RelationshipContextSchema).optional(),
        relational: RelationalProfileSchema.partial().optional(),
        boundaries: BoundaryProfileSchema.partial().optional(),
        persona: PersonaSchema.partial().optional(),
        decision: DecisionStyleSchema.partial().optional(),
        behavior: BehavioralContractSchema.partial().optional(),
        domain: DomainContextSchema.partial().optional(),
        tone: z
          .enum(['warm', 'direct', 'formal', 'playful', 'calm'])
          .optional(),
        directness: z.number().min(0).max(1).optional(),
        warmth: z.number().min(0).max(1).optional(),
        verbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
        structure: z
          .enum(['conversational', 'bulleted', 'narrative', 'mixed'])
          .optional(),
        humor: z.enum(['none', 'light', 'playful']).optional(),
        preferredPhrases: z.array(z.string()).optional(),
        avoidedPhrases: z.array(z.string()).optional(),
        decisionPriorities: z.array(z.string()).optional(),
        tradeoffs: z.array(z.string()).optional(),
        reversibilityPreference: z
          .enum(['reversible_first', 'balanced', 'decisive'])
          .optional(),
        asksBeforeCommitment: z.array(z.string()).optional(),
        confidenceFloor: z.number().min(0).max(1).optional(),
        relationship: z
          .enum(['assistant', 'advisor', 'delegate', 'representative'])
          .optional(),
        speakAs: z.enum(['agent', 'representative', 'collaborator']).optional(),
        discloseAgentIdentity: z.boolean().optional(),
        whenUncertain: z
          .enum(['ask', 'state_uncertainty', 'offer_options'])
          .optional(),
        whenDisagreeing: z
          .enum(['challenge_respectfully', 'surface_tradeoff', 'defer'])
          .optional(),
        whenWrong: z
          .enum(['admit_and_correct', 'explain_correction', 'brief_apology'])
          .optional(),
        askBefore: z.array(z.string()).optional(),
        neverClaim: z.array(z.string()).optional(),
        neverDo: z.array(z.string()).optional(),
        responsePrinciples: z.array(z.string()).optional(),
        currentPriorities: z.array(z.string()).optional(),
        knownConstraints: z.array(z.string()).optional(),
      }),
      request.body,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    if (body.displayName !== undefined) human.displayName = body.displayName;
    if (body.role !== undefined) human.role = body.role;
    human.identity = IdentityProfileSchema.parse({
      ...human.identity,
      ...body.identity,
      preferredName: body.preferredName ?? human.identity.preferredName,
      pronouns: body.pronouns ?? human.identity.pronouns,
      mission: body.mission ?? human.identity.mission,
      organization: body.organization ?? human.identity.organization,
      locale: body.locale ?? human.identity.locale,
      timezone: body.timezone ?? human.identity.timezone,
    });
    human.persona = PersonaSchema.parse({
      ...human.persona,
      ...body.persona,
      displayName: body.displayName ?? human.persona.displayName,
      role: body.role ?? human.persona.role,
      communicationStyle:
        body.communicationStyle ?? human.persona.communicationStyle,
      values: body.values ?? human.persona.values,
      riskTolerance: body.riskTolerance ?? human.persona.riskTolerance,
      tone: body.tone ?? human.persona.tone,
      directness: body.directness ?? human.persona.directness,
      warmth: body.warmth ?? human.persona.warmth,
      verbosity: body.verbosity ?? human.persona.verbosity,
      structure: body.structure ?? human.persona.structure,
      humor: body.humor ?? human.persona.humor,
      preferredPhrases: body.preferredPhrases ?? human.persona.preferredPhrases,
      avoidedPhrases: body.avoidedPhrases ?? human.persona.avoidedPhrases,
    });
    if (body.selfConcept)
      human.selfConcept = SelfConceptSchema.parse({
        ...human.selfConcept,
        ...body.selfConcept,
      });
    if (body.biography)
      human.biography = BiographySchema.parse({
        ...human.biography,
        ...body.biography,
      });
    if (body.relationships)
      human.relationships = body.relationships.map((relationship) =>
        RelationshipContextSchema.parse(relationship),
      );
    if (body.relational)
      human.relational = RelationalProfileSchema.parse({
        ...human.relational,
        ...body.relational,
      });
    if (body.boundaries)
      human.boundaries = BoundaryProfileSchema.parse({
        ...human.boundaries,
        ...body.boundaries,
      });
    human.domain = DomainContextSchema.parse({
      ...human.domain,
      business: body.business ?? human.domain.business,
      icp: body.icp ?? human.domain.icp,
      offer: body.offer ?? human.domain.offer,
      exclusions: body.exclusions ?? human.domain.exclusions,
      goals: body.goals ?? human.domain.goals,
    });
    human.decision = DecisionStyleSchema.parse({
      ...human.decision,
      ...body.decision,
      priorities: body.decisionPriorities ?? human.decision.priorities,
      tradeoffs: body.tradeoffs ?? human.decision.tradeoffs,
      riskTolerance: body.riskTolerance ?? human.decision.riskTolerance,
      reversibilityPreference:
        body.reversibilityPreference ?? human.decision.reversibilityPreference,
      asksBeforeCommitment:
        body.asksBeforeCommitment ?? human.decision.asksBeforeCommitment,
      confidenceFloor: body.confidenceFloor ?? human.decision.confidenceFloor,
    });
    human.behavior = BehavioralContractSchema.parse({
      ...human.behavior,
      ...body.behavior,
      relationship: body.relationship ?? human.behavior.relationship,
      speakAs: body.speakAs ?? human.behavior.speakAs,
      discloseAgentIdentity:
        body.discloseAgentIdentity ?? human.behavior.discloseAgentIdentity,
      whenUncertain: body.whenUncertain ?? human.behavior.whenUncertain,
      whenDisagreeing: body.whenDisagreeing ?? human.behavior.whenDisagreeing,
      whenWrong: body.whenWrong ?? human.behavior.whenWrong,
      askBefore: body.askBefore ?? human.behavior.askBefore,
      neverClaim: body.neverClaim ?? human.behavior.neverClaim,
      neverDo: body.neverDo ?? human.behavior.neverDo,
      responsePrinciples:
        body.responsePrinciples ?? human.behavior.responsePrinciples,
    });
    human.currentPriorities = body.currentPriorities ?? human.currentPriorities;
    human.knownConstraints = body.knownConstraints ?? human.knownConstraints;
    human.modelVersion = (human.modelVersion ?? 1) + 1;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'onboarding.completed',
      payload: { fields: Object.keys(body) },
    });
    return human;
  });

  app.post('/v1/conversations', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({
        title: z.string().optional(),
        channel: z.string().optional(),
        audience: z.string().optional(),
        summary: z.string().optional(),
        activeTopic: z.string().optional(),
        openLoops: z.array(z.string()).default([]),
      }),
      request.body,
    );
    const agent = store.agents.get(credential.agentId!);
    const human = store.humans.get(credential.humanId);
    if (!agent || !human || !store.getDelegationForAgent(agent.id, human.id))
      throw error(403, 'Active delegation required');
    const now = new Date().toISOString();
    const conversation = {
      id: crypto.randomUUID(),
      humanId: human.id,
      agentId: agent.id,
      title: body.title,
      channel: body.channel,
      audience: body.audience,
      summary: body.summary,
      activeTopic: body.activeTopic,
      openLoops: body.openLoops ?? [],
      createdAt: now,
      updatedAt: now,
    };
    store.conversations.set(conversation.id, conversation);
    store.conversationTurns.set(conversation.id, []);
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: agent.id,
      eventType: 'conversation.created',
      payload: { conversationId: conversation.id },
    });
    return conversation;
  });

  app.get('/v1/conversations', async (request) => {
    const credential = requireCredential(store, request);
    return [...store.conversations.values()]
      .filter((conversation) => conversation.humanId === credential.humanId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  app.get('/v1/conversations/:conversationId/turns', async (request) => {
    const credential = requireCredential(store, request);
    const params = request.params as { conversationId: string };
    const conversation = store.conversations.get(params.conversationId);
    if (!conversation || conversation.humanId !== credential.humanId)
      throw error(404, 'Conversation not found');
    if (
      credential.kind === 'agent' &&
      conversation.agentId !== credential.agentId
    )
      throw error(403, 'Conversation is not assigned to this agent');
    return store.conversationTurns.get(conversation.id) ?? [];
  });

  app.post('/v1/conversations/:conversationId/turns', async (request) => {
    const credential = requireCredential(store, request);
    const params = request.params as { conversationId: string };
    const body = parse(
      z.object({
        content: z.string().min(1),
        metadata: z.record(z.unknown()).default({}),
      }),
      request.body,
    );
    const conversation = store.conversations.get(params.conversationId);
    if (!conversation || conversation.humanId !== credential.humanId)
      throw error(404, 'Conversation not found');
    if (
      credential.kind === 'agent' &&
      conversation.agentId !== credential.agentId
    )
      throw error(403, 'Conversation is not assigned to this agent');
    const turn = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role:
        credential.kind === 'human' ? ('human' as const) : ('agent' as const),
      content: body.content,
      metadata: body.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    const turns = store.conversationTurns.get(conversation.id) ?? [];
    turns.push(turn);
    store.conversationTurns.set(conversation.id, turns.slice(-200));
    conversation.updatedAt = turn.createdAt;
    const human = store.humans.get(conversation.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: conversation.agentId,
      eventType: 'conversation.turn_added',
      payload: { conversationId: conversation.id, role: turn.role },
    });
    return turn;
  });

  app.post('/v1/context/feedback', async (request) => {
    const credential = requireCredential(store, request);
    const body = parse(
      z.object({
        contextPacketId: z.string(),
        rating: z.enum(['helpful', 'mixed', 'unhelpful']),
        correction: z.string().optional(),
        whatWorked: z.string().optional(),
        whatToChange: z.string().optional(),
      }),
      request.body,
    );
    const context = store.contexts.get(body.contextPacketId);
    if (!context || context.humanId !== credential.humanId)
      throw error(404, 'Context packet not found');
    if (credential.kind === 'agent' && context.agentId !== credential.agentId)
      throw error(403, 'Context packet is not assigned to this agent');
    const feedback = {
      id: crypto.randomUUID(),
      humanId: context.humanId,
      agentId: context.agentId,
      contextPacketId: context.packet.packetId,
      rating: body.rating,
      correction: body.correction,
      whatWorked: body.whatWorked,
      whatToChange: body.whatToChange,
      createdAt: new Date().toISOString(),
    };
    store.feedback.set(feedback.id, feedback);
    const human = store.humans.get(context.humanId)!;
    let memoryId: string | undefined;
    if (credential.kind === 'human' && body.correction) {
      const correction = await store.memories.add({
        humanId: human.id,
        organizationId: human.organizationId,
        kind: 'correction',
        content: body.correction,
        source: `feedback:${feedback.id}`,
        confirmation: 'user_confirmed',
        priority: 100,
        sensitivity: 'normal',
      });
      memoryId = correction.id;
    }
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: context.agentId,
      eventType: 'context.feedback_recorded',
      payload: {
        feedbackId: feedback.id,
        contextPacketId: context.packet.packetId,
        rating: feedback.rating,
        memoryId,
      },
    });
    return { feedback, memoryId };
  });

  app.get('/v1/context/feedback', async (request) => {
    const credential = requireCredential(store, request);
    return [...store.feedback.values()]
      .filter(
        (item) =>
          item.humanId === credential.humanId &&
          (credential.kind === 'human' || item.agentId === credential.agentId),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  app.post('/v1/workflows', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({
        profileId: z.string().default('growth_operator_v1'),
        goal: z.string().min(1),
        contextPacketId: z.string().optional(),
        data: z.record(z.unknown()).default({}),
      }),
      request.body,
    );
    const agent = store.agents.get(credential.agentId!);
    const human = store.humans.get(credential.humanId);
    const delegation = store.getDelegationForAgent(
      credential.agentId!,
      credential.humanId,
    );
    const profile = getExpertProfile(body.profileId ?? 'growth_operator_v1');
    if (!agent || !human || !delegation)
      throw error(403, 'Active delegation required');
    if (!profile) throw error(404, 'Expert profile not found');
    if (profile.status === 'planned')
      throw error(501, `Expert profile '${profile.id}' is not available yet`);
    if (body.contextPacketId) {
      const context = store.contexts.get(body.contextPacketId);
      if (
        !context ||
        context.agentId !== agent.id ||
        context.humanId !== human.id
      )
        throw error(404, 'Context packet not found');
      if (new Date(context.packet.expiresAt) <= new Date())
        throw error(410, 'Context packet expired');
    }
    const requiredContext = {
      ...human.domain,
      communicationStyle: human.persona.communicationStyle,
    };
    const missing = missingProfileContext(profile, requiredContext);
    const now = new Date().toISOString();
    const workflow = {
      id: crypto.randomUUID(),
      humanId: human.id,
      agentId: agent.id,
      profileId: profile.id,
      goal: body.goal,
      currentStep: missing.length ? ('blocked' as const) : ('intake' as const),
      contextPacketId: body.contextPacketId,
      data: { ...body.data, missingRequiredContext: missing },
      createdAt: now,
      updatedAt: now,
    };
    store.workflows.set(workflow.id, workflow);
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: agent.id,
      eventType: 'workflow.created',
      payload: {
        workflowId: workflow.id,
        profileId: workflow.profileId,
        missingRequiredContext: missing,
      },
    });
    return workflow;
  });

  app.get('/v1/workflows', async (request) => {
    const credential = requireCredential(store, request);
    return [...store.workflows.values()]
      .filter((workflow) => workflow.humanId === credential.humanId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  app.get('/v1/workflows/:workflowId', async (request) => {
    const credential = requireCredential(store, request);
    const params = request.params as { workflowId: string };
    const workflow = store.workflows.get(params.workflowId);
    if (!workflow || workflow.humanId !== credential.humanId)
      throw error(404, 'Workflow not found');
    if (credential.kind === 'agent' && workflow.agentId !== credential.agentId)
      throw error(403, 'Workflow is not assigned to this agent');
    return workflow;
  });

  app.post('/v1/workflows/:workflowId/transition', async (request) => {
    const credential = requireCredential(store, request);
    const params = request.params as { workflowId: string };
    const body = parse(
      z.object({ step: z.string(), data: z.record(z.unknown()).default({}) }),
      request.body,
    );
    const workflow = store.workflows.get(params.workflowId);
    if (!workflow || workflow.humanId !== credential.humanId)
      throw error(404, 'Workflow not found');
    if (workflow.currentStep === 'blocked' && body.step === 'intake') {
      workflow.currentStep = 'intake';
    } else if (workflowTransitions[workflow.currentStep] !== body.step) {
      throw error(
        409,
        `Invalid workflow transition from ${workflow.currentStep} to ${body.step}`,
      );
    } else {
      workflow.currentStep = body.step as WorkflowStep;
    }
    workflow.data = { ...workflow.data, ...body.data };
    workflow.updatedAt = new Date().toISOString();
    const human = store.humans.get(workflow.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: workflow.agentId,
      eventType: 'workflow.transitioned',
      payload: { workflowId: workflow.id, step: workflow.currentStep },
    });
    return workflow;
  });

  app.get('/v1/approvals', async (request) => {
    const credential = requireCredential(store, request, 'human');
    return [...store.approvals.values()]
      .filter((approval) => approval.humanId === credential.humanId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  app.post('/v1/delegations/:delegationId/revoke', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { delegationId: string };
    const delegation = store.delegations.get(params.delegationId);
    if (!delegation || delegation.humanId !== credential.humanId)
      throw error(404, 'Delegation not found');
    delegation.revokedAt = new Date().toISOString();
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: delegation.agentId,
      eventType: 'delegation.revoked',
      payload: { delegationId: delegation.id },
    });
    return delegation;
  });

  app.post('/v1/context', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(contextBody, request.body);
    const agent = credential.agentId
      ? store.agents.get(credential.agentId)
      : undefined;
    const human = store.humans.get(credential.humanId);
    const delegation = agent
      ? store.getDelegationForAgent(agent.id, credential.humanId)
      : undefined;
    if (!agent || !human || !delegation)
      throw error(403, 'No active delegation for this agent');
    if (delegation.expiresAt && new Date(delegation.expiresAt) <= new Date())
      throw error(403, 'Delegation has expired');
    const allowedCapabilities = [
      ...delegation.authority.mayRead,
      ...delegation.authority.mayDraft,
      ...delegation.authority.mayWrite,
      ...delegation.authority.requiresApproval,
    ];
    const unauthorizedCapabilities = (body.requestedCapabilities ?? []).filter(
      (requested) =>
        !allowedCapabilities.some(
          (allowed) =>
            requested === allowed || requested.startsWith(`${allowed}:`),
        ),
    );
    if (unauthorizedCapabilities.length)
      throw error(
        403,
        `Requested capabilities are outside delegation: ${unauthorizedCapabilities.join(', ')}`,
      );
    const includeSensitiveContext = delegation.authority.mayRead.includes(
      'sensitive_context_read',
    );

    // Normalize profiles loaded from older migrations before they enter a
    // packet. This keeps the packet contract stable during rolling upgrades.
    const identity = IdentityProfileSchema.parse(human.identity ?? {});
    const persona = PersonaSchema.parse(human.persona ?? {});
    const selfConcept = SelfConceptSchema.parse(human.selfConcept ?? {});
    const biography = BiographySchema.parse(human.biography ?? {});
    const relationships = (human.relationships ?? []).map((relationship) =>
      RelationshipContextSchema.parse(relationship),
    );
    const relational = RelationalProfileSchema.parse(human.relational ?? {});
    const boundaries = BoundaryProfileSchema.parse(human.boundaries ?? {});
    const domain = DomainContextSchema.parse(human.domain ?? {});
    const decision = DecisionStyleSchema.parse(human.decision ?? {});
    const behavior = BehavioralContractSchema.parse(human.behavior ?? {});
    const judgment = JudgmentRulesSchema.parse(human.judgment ?? {});

    let interaction: InteractionContext = {
      conversationId: body.conversationId,
      taskMetadata: body.taskMetadata ?? {},
      channel: body.channel,
      audience: body.audience,
      activeTopic: body.activeTopic,
      userIntent: body.userIntent,
      openLoops: [],
      recentTurns: [],
    };
    if (body.conversationId) {
      const conversation = store.conversations.get(body.conversationId);
      if (
        !conversation ||
        conversation.humanId !== human.id ||
        conversation.agentId !== agent.id
      )
        throw error(404, 'Conversation not found');
      interaction = {
        conversationId: conversation.id,
        taskMetadata: body.taskMetadata ?? {},
        channel: body.channel ?? conversation.channel,
        audience: body.audience ?? conversation.audience,
        summary: conversation.summary,
        activeTopic: body.activeTopic ?? conversation.activeTopic,
        userIntent: body.userIntent,
        openLoops: conversation.openLoops,
        recentTurns: (store.conversationTurns.get(conversation.id) ?? [])
          .slice(-12)
          .map((turn) => ({
            id: turn.id,
            role: turn.role,
            content: turn.content,
            createdAt: turn.createdAt,
            metadata: turn.metadata,
          })),
      };
    }

    // Always include confirmed preferences and corrections; task retrieval may be added as a second semantic pass.
    const baselineHits = await store.memories.search({
      humanId: human.id,
      organizationId: human.organizationId,
      limit: 24,
    });
    const criticalHits = await store.memories.search({
      humanId: human.id,
      organizationId: human.organizationId,
      kinds: ['identity', 'preference', 'boundary', 'correction'],
      limit: 100,
    });
    const taskHits = await store.memories.search({
      humanId: human.id,
      organizationId: human.organizationId,
      query: body.task,
      limit: 24,
    });
    const hitMap = new Map(
      [...criticalHits, ...baselineHits, ...taskHits].map((hit) => [
        hit.id,
        hit,
      ]),
    );
    const hits = [...hitMap.values()]
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, 32);
    const memory: MemoryContext = {
      preferences: hits
        .filter((hit) => hit.kind === 'preference')
        .map((hit) => memoryText(hit.content)),
      corrections: hits
        .filter((hit) => hit.kind === 'correction' || hit.kind === 'boundary')
        .map((hit) => memoryText(hit.content)),
      episodes: hits
        .filter((hit) => hit.kind === 'episode')
        .map((hit) => memoryText(hit.content)),
      outcomes: hits
        .filter((hit) => hit.kind === 'outcome')
        .map((hit) =>
          typeof hit.content === 'string'
            ? { value: hit.content }
            : hit.content,
        ),
      references: hits.map((hit) => ({
        id: hit.id,
        kind: hit.kind,
        source: hit.source,
        confidence: hit.confidence,
        confirmation: hit.confirmation,
        priority: hit.priority,
        sensitivity: hit.sensitivity,
        validUntil: hit.validUntil,
      })),
      items: hits.map((hit) => ({
        id: hit.id,
        kind: hit.kind,
        content: hit.content,
        source: hit.source,
        confidence: hit.confidence,
        confirmation: hit.confirmation,
        priority: hit.priority,
        sensitivity: hit.sensitivity,
        createdAt: hit.createdAt,
      })),
    };
    const grounding: Grounding = {
      precedence: [
        'explicit_correction',
        'explicit_preference',
        'active_boundary',
        'recent_outcome',
        'structured_profile',
        'inferred_memory',
      ],
      conflicts: [],
      uncertainties: hits
        .filter(
          (hit) =>
            hit.confirmation === 'inferred' ||
            (hit.confidence !== undefined && hit.confidence < 0.7),
        )
        .map((hit) => `Memory ${hit.id} is not fully confirmed`),
      instructions: [
        'Treat explicit corrections as authoritative over older memories',
        'Do not present inferred memories as facts',
        'Preserve the human’s communication preferences while remaining truthful about agent identity',
      ],
    };
    const rawHumanModel: HumanModel = {
      version: human.modelVersion ?? 1,
      identity,
      persona,
      selfConcept,
      biography,
      relationships,
      relational,
      boundaries,
      domain,
      decision,
      behavior,
      responseGuidance: {
        style: [],
        prioritize: [],
        avoid: [],
        whenUncertain: behavior.whenUncertain,
        whenDisagreeing: behavior.whenDisagreeing,
        whenWrong: behavior.whenWrong,
        identityDisclosure: behavior.discloseAgentIdentity
          ? 'Be truthful that you are an AI agent acting with delegated context.'
          : 'Do not volunteer agent identity unless asked, but never impersonate a human or make false claims.',
        identitySummary: [],
        relationshipGuidance: [],
        emotionalGuidance: [],
        decisionGuidance: [],
        refusalStyle: behavior.refusalStyle,
        preserveHumanVoice: behavior.preserveHumanVoice,
      },
      currentPriorities: human.currentPriorities ?? [],
      knownConstraints: human.knownConstraints ?? [],
    };
    const scopedHumanModel = scopeHumanModel(
      HumanModelSchema.parse(rawHumanModel),
      includeSensitiveContext,
    );
    if (scopedHumanModel.redactions.length) {
      grounding.instructions.push(
        'Sensitive profile facts were withheld because this delegation does not include sensitive_context_read',
      );
    }
    const packet = compileHumanContextPacket({
      human,
      agent: {
        id: agent.id,
        runtime: agent.runtime,
        delegationId: delegation.id,
      },
      task: body.task,
      persona,
      domain,
      memory,
      authority: delegation.authority,
      judgment,
      humanModel: scopedHumanModel.model,
      interaction,
      grounding,
      redactions: scopedHumanModel.redactions,
      policyVersion: delegation.profileId ?? 'default_v1',
      ttlMinutes: contextTtlMinutes,
      memoryReferences: memory.references,
    });
    const signature = await new SignJWT(
      packet as unknown as Record<string, unknown>,
    )
      .setProtectedHeader({ alg: 'HS256', typ: 'DEAL-CTX' })
      .setSubject(packet.packetId)
      .setAudience(agent.id)
      .setIssuedAt(Math.floor(new Date(packet.issuedAt).getTime() / 1000))
      .setExpirationTime(
        Math.floor(new Date(packet.expiresAt).getTime() / 1000),
      )
      .sign(keyFromSecret(jwtSecret));
    store.contexts.set(packet.packetId, {
      packet,
      signature,
      humanId: human.id,
      agentId: agent.id,
      createdAt: packet.issuedAt,
    });
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: agent.id,
      eventType: 'context.issued',
      payload: {
        packetId: packet.packetId,
        taskHash: packet.taskHash,
        memoryCount: hits.length,
      },
    });
    return { packetId: packet.packetId, packet, signature };
  });

  app.get('/v1/context/:packetId', async (request) => {
    const credential = requireCredential(store, request);
    const params = request.params as { packetId: string };
    const context = store.contexts.get(params.packetId);
    if (!context || context.humanId !== credential.humanId)
      throw error(404, 'Context packet not found');
    if (credential.kind === 'agent' && context.agentId !== credential.agentId)
      throw error(403, 'Context packet is not assigned to this agent');
    try {
      await jwtVerify(context.signature, keyFromSecret(jwtSecret), {
        audience: context.agentId,
        subject: context.packet.packetId,
      });
    } catch {
      throw error(500, 'Stored context packet signature is invalid');
    }
    return {
      packetId: context.packet.packetId,
      packet: context.packet,
      signature: context.signature,
      expired: new Date(context.packet.expiresAt) <= new Date(),
    };
  });

  app.post('/v1/policy/evaluate', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(policyBody, request.body);
    const context = store.contexts.get(body.contextPacketId);
    if (
      !context ||
      context.agentId !== credential.agentId ||
      context.humanId !== credential.humanId
    )
      throw error(404, 'Context packet not found');
    if (new Date(context.packet.expiresAt) <= new Date())
      throw error(410, 'Context packet expired');
    const delegation = credential.agentId
      ? store.getDelegationForAgent(credential.agentId, credential.humanId)
      : undefined;
    const human = store.humans.get(credential.humanId);
    if (!delegation || !human) throw error(403, 'Active delegation required');
    const result = evaluatePolicy(
      delegation.authority,
      human.judgment,
      body,
      delegation.policyRules,
    );
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: credential.agentId,
      eventType: 'policy.evaluated',
      payload: {
        ...result,
        action: body.action,
        contextPacketId: body.contextPacketId,
      },
    });
    return result;
  });

  app.post('/v1/approvals', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({
        contextPacketId: z.string(),
        action: z.string(),
        summary: z.string().min(1),
        payload: z.unknown(),
        resource: z.string().optional(),
        recipientCount: z.number().int().nonnegative().optional(),
        spendUsd: z.number().nonnegative().optional(),
        irreversible: z.boolean().optional(),
        confidence: z.number().min(0).max(1).optional(),
        sensitiveFields: z.array(z.string()).optional(),
      }),
      request.body,
    );
    const context = store.contexts.get(body.contextPacketId);
    if (
      !context ||
      context.agentId !== credential.agentId ||
      context.humanId !== credential.humanId
    )
      throw error(404, 'Context packet not found');
    if (new Date(context.packet.expiresAt) <= new Date())
      throw error(410, 'Context packet expired');
    const delegation = store.getDelegationForAgent(
      credential.agentId!,
      credential.humanId,
    );
    const human = store.humans.get(credential.humanId);
    if (!delegation || !human) throw error(403, 'Active delegation required');
    const policyResult = evaluatePolicy(
      delegation.authority,
      human.judgment,
      {
        action: body.action,
        resource: body.resource,
        recipientCount: body.recipientCount,
        spendUsd: body.spendUsd,
        irreversible: body.irreversible,
        confidence: body.confidence,
        sensitiveFields: body.sensitiveFields,
      },
      delegation.policyRules,
    );
    if (
      policyResult.decision !== 'require_approval' &&
      policyResult.decision !== 'escalate'
    )
      throw error(
        409,
        `Approval is not required for this action: ${policyResult.reason}`,
      );
    const approval = {
      id: crypto.randomUUID(),
      humanId: credential.humanId,
      agentId: credential.agentId!,
      contextPacketId: body.contextPacketId,
      action: body.action,
      summary: body.summary,
      payload: body.payload,
      payloadHash: hashPayload(body.payload),
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      policyResult,
    };
    store.approvals.set(approval.id, approval);
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: credential.agentId,
      eventType: 'approval.requested',
      payload: {
        approvalId: approval.id,
        action: approval.action,
        payloadHash: approval.payloadHash,
        policyResult,
      },
    });
    return approval;
  });

  app.post('/v1/approvals/:approvalId/decision', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { approvalId: string };
    const body = parse(
      z.object({ decision: z.enum(['approved', 'denied']) }),
      request.body,
    );
    const approval = store.approvals.get(params.approvalId);
    if (!approval || approval.humanId !== credential.humanId)
      throw error(404, 'Approval not found');
    if (approval.status !== 'pending')
      throw error(409, 'Approval is no longer pending');
    const context = store.contexts.get(approval.contextPacketId);
    if (!context || new Date(context.packet.expiresAt) <= new Date()) {
      approval.status = 'expired';
      throw error(410, 'Context packet expired');
    }
    approval.status = body.decision;
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = credential.humanId;
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: approval.agentId,
      eventType: `approval.${body.decision}`,
      payload: { approvalId: approval.id, payloadHash: approval.payloadHash },
    });
    return approval;
  });

  app.post('/v1/approvals/:approvalId/consume', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const params = request.params as { approvalId: string };
    const body = parse(z.object({ payload: z.unknown() }), request.body);
    const approval = store.approvals.get(params.approvalId);
    if (
      !approval ||
      approval.agentId !== credential.agentId ||
      approval.humanId !== credential.humanId
    )
      throw error(404, 'Approval not found');
    if (approval.status !== 'approved')
      throw error(409, 'Approval has not been approved');
    if (approval.consumedAt)
      throw error(409, 'Approval has already been consumed');
    if (hashPayload(body.payload) !== approval.payloadHash)
      throw error(409, 'Payload does not match the approved action');
    const context = store.contexts.get(approval.contextPacketId);
    if (!context || new Date(context.packet.expiresAt) <= new Date())
      throw error(410, 'Context packet expired');
    approval.consumedAt = new Date().toISOString();
    const executionToken = await new SignJWT({
      approvalId: approval.id,
      action: approval.action,
      payloadHash: approval.payloadHash,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'DEAL-ACTION' })
      .setSubject(approval.id)
      .setAudience(approval.agentId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keyFromSecret(jwtSecret));
    const human = store.humans.get(approval.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: approval.agentId,
      eventType: 'approval.consumed',
      payload: {
        approvalId: approval.id,
        action: approval.action,
        payloadHash: approval.payloadHash,
      },
    });
    return {
      approvalId: approval.id,
      action: approval.action,
      payloadHash: approval.payloadHash,
      executionToken,
    };
  });

  app.post('/v1/actions/verify', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({
        executionToken: z.string().min(1),
        action: z.string().min(1),
        payload: z.unknown(),
      }),
      request.body,
    );
    let claims: {
      approvalId?: unknown;
      action?: unknown;
      payloadHash?: unknown;
    };
    try {
      const verified = await jwtVerify(
        body.executionToken,
        keyFromSecret(jwtSecret),
        { audience: credential.agentId },
      );
      claims = verified.payload as typeof claims;
    } catch {
      throw error(401, 'Invalid or expired execution token');
    }
    const approvalId = String(claims.approvalId ?? '');
    const approval = store.approvals.get(approvalId);
    if (
      !approval ||
      approval.agentId !== credential.agentId ||
      approval.humanId !== credential.humanId ||
      approval.status !== 'approved' ||
      !approval.consumedAt ||
      approval.action !== body.action ||
      claims.action !== body.action ||
      claims.payloadHash !== hashPayload(body.payload) ||
      approval.payloadHash !== hashPayload(body.payload)
    )
      throw error(403, 'Execution token does not authorize this action');
    return {
      authorized: true,
      approvalId: approval.id,
      action: approval.action,
      payloadHash: approval.payloadHash,
    };
  });

  app.post('/v1/memory', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({
        kind: z.enum([
          'identity',
          'preference',
          'boundary',
          'correction',
          'episode',
          'outcome',
          'domain_knowledge',
          'relationship',
        ]),
        content: z.union([z.string(), z.record(z.unknown())]),
        source: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        confirmation: z
          .enum(['user_confirmed', 'agent_observed', 'inferred'])
          .optional(),
        priority: z.number().int().min(0).max(100).optional(),
        sensitivity: z.enum(['normal', 'personal', 'sensitive']).optional(),
      }),
      request.body,
    );
    const delegation = store.getDelegationForAgent(
      credential.agentId!,
      credential.humanId,
    );
    if (
      !delegation?.authority.mayWrite.some(
        (capability) => capability === 'memory_write',
      )
    )
      throw error(403, 'Memory writes are outside delegated authority');
    if (
      ['identity', 'preference', 'boundary', 'correction'].includes(body.kind)
    )
      throw error(403, 'User-confirmed memory kinds require a human action');
    const human = store.humans.get(credential.humanId)!;
    const memory = await store.memories.add({
      humanId: human.id,
      organizationId: human.organizationId,
      kind: body.kind,
      content: body.content,
      source: body.source ?? 'agent',
      confidence: body.confidence,
      confirmation: body.confirmation ?? 'agent_observed',
      priority: body.priority,
      sensitivity: body.sensitivity ?? 'normal',
    });
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: credential.agentId,
      eventType: 'memory.created',
      payload: { memoryId: memory.id, kind: body.kind },
    });
    return memory;
  });

  app.get('/v1/memory', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const query = request.query as {
      q?: string;
      kinds?: string;
      limit?: string;
    };
    const hits = await store.memories.search({
      humanId: credential.humanId,
      organizationId: store.humans.get(credential.humanId)?.organizationId,
      query: query.q,
      kinds: query.kinds?.split(',').filter(Boolean) as never,
      limit: query.limit ? Math.min(Number(query.limit), 100) : 50,
    });
    return hits;
  });

  app.post('/v1/memory/outcomes', async (request) => {
    const credential = requireCredential(store, request, 'agent');
    const body = parse(
      z.object({ contextPacketId: z.string(), outcome: z.record(z.unknown()) }),
      request.body,
    );
    const context = store.contexts.get(body.contextPacketId);
    if (
      !context ||
      context.humanId !== credential.humanId ||
      context.agentId !== credential.agentId
    )
      throw error(404, 'Context packet not found');
    const delegation = store.getDelegationForAgent(
      credential.agentId!,
      credential.humanId,
    );
    if (
      !delegation?.authority.mayWrite.some(
        (capability) => capability === 'memory_write',
      )
    )
      throw error(403, 'Memory writes are outside delegated authority');
    const human = store.humans.get(credential.humanId)!;
    const memory = await store.memories.add({
      humanId: human.id,
      organizationId: human.organizationId,
      kind: 'outcome',
      content: body.outcome,
      source: `context:${body.contextPacketId}`,
    });
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: credential.agentId,
      eventType: 'memory.outcome_recorded',
      payload: { memoryId: memory.id, contextPacketId: body.contextPacketId },
    });
    return memory;
  });

  app.post('/v1/memory/:memoryId/correct', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { memoryId: string };
    const body = parse(
      z.object({ replacement: z.union([z.string(), z.record(z.unknown())]) }),
      request.body,
    );
    const existing = await store.memories.get(params.memoryId);
    if (
      !existing ||
      existing.humanId !== credential.humanId ||
      existing.organizationId !==
        store.humans.get(credential.humanId)?.organizationId
    )
      throw error(404, 'Memory record not found');
    const replacement = await store.memories.correct(
      params.memoryId,
      body.replacement,
    );
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'memory.corrected',
      payload: { memoryId: params.memoryId, replacementId: replacement.id },
    });
    return {
      memoryId: params.memoryId,
      replacementId: replacement.id,
      corrected: true,
    };
  });

  app.delete('/v1/memory/:memoryId', async (request) => {
    const credential = requireCredential(store, request, 'human');
    const params = request.params as { memoryId: string };
    const existing = await store.memories.get(params.memoryId);
    if (
      !existing ||
      existing.humanId !== credential.humanId ||
      existing.organizationId !==
        store.humans.get(credential.humanId)?.organizationId
    )
      throw error(404, 'Memory record not found');
    const lineage = new Set([params.memoryId]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const memory of store.memories.all) {
        if (memory.supersededBy && lineage.has(memory.supersededBy)) {
          if (!lineage.has(memory.id)) {
            lineage.add(memory.id);
            expanded = true;
          }
        }
      }
    }
    for (const memoryId of lineage) {
      await store.memories.forget(memoryId);
      store.forgottenMemoryIds.add(memoryId);
    }
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'memory.forgotten',
      payload: { memoryId: params.memoryId },
    });
    return { memoryId: params.memoryId, forgotten: true };
  });

  app.get('/v1/audit', async (request) => {
    const credential = requireCredential(store, request);
    return store.audits.filter((event) => event.humanId === credential.humanId);
  });

  app.setErrorHandler((cause, request, reply) => {
    const caught = cause as Error & { statusCode?: number };
    request.log.error({ err: cause }, 'request failed');
    const statusCode = caught.statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : caught.message,
    });
  });
  return app;
}
