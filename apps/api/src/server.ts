import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { createGateway, generateText } from 'ai';
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
  SkillArtifactFileSchema,
  SkillArtifactManifestSchema,
  SkillAttestationSchema,
  SkillDescriptorSchema,
  SkillRegistryEntrySchema,
  SkillReviewStatusSchema,
} from '@deal/core';
import type { Grounding, InteractionContext, MemoryContext } from '@deal/core';
import type { HumanModel, ProfileFact, SkillRegistryEntry } from '@deal/core';
import { evaluatePolicy, type PolicyRule } from '@deal/policy';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import {
  DealStore,
  hashPayload,
  hashToken,
  type Agent,
  type Credential,
  type Delegation,
  type Human,
} from './store.js';
import {
  credentialKeyHint,
  decryptSecret,
  encryptSecret,
} from './secret-storage.js';
import type { ExternalAuthProvider } from './external-auth.js';
import { MetricsRegistry } from './observability.js';
import { InMemoryRateLimiter, type RateLimiter } from './rate-limit.js';
import {
  getExpertProfile,
  profileRegistry,
  missingProfileContext,
} from './profiles.js';
import {
  getProfessionProfile,
  humanContextStructures,
  lifeContextStructures,
  professionCatalog,
  searchProfessionProfiles,
} from './professions.js';
import { routeTaskCognition } from './cognition-router.js';
import type { WorkflowStep } from './store.js';
import { SkillSigner } from './skill-signing.js';
import type { DealAuth } from './auth.js';
import { betterAuthIssuer } from './auth.js';
import { renderDealContext } from '@deal/sdk';

export interface ServerOptions {
  store?: DealStore;
  jwtSecret?: string;
  credentialEncryptionKey?: string;
  aiGatewayModelsUrl?: string;
  fetchImpl?: typeof fetch;
  contextTtlMinutes?: number;
  externalAuth?: ExternalAuthProvider;
  rateLimiter?: RateLimiter;
  metrics?: MetricsRegistry;
  rateLimitPerMinute?: number;
  contextRateLimitPerMinute?: number;
  skillSigner?: SkillSigner;
  auth?: DealAuth;
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
  skills: z.array(SkillDescriptorSchema).max(16).default([]),
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

const comparisonBody = z.object({
  task: z.string().trim().min(1).max(12_000),
  agentId: z.string().optional(),
  image: z
    .object({
      name: z.string().trim().min(1).max(160),
      mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      data: z.string().max(7_500_000),
    })
    .optional(),
});

const aiGatewayCredentialBody = z.object({
  apiKey: z.string().trim().min(10).max(512),
  model: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[^/\s]+\/[^/\s]+$/, 'Model must use provider/model format'),
});

const aiGatewayModelUpdateBody = z.object({
  model: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[^/\s]+\/[^/\s]+$/, 'Model must use provider/model format'),
});

const aiGatewayModelSchema = z.object({
  id: z.string().min(3),
  name: z.string().nullish(),
  owned_by: z.string().nullish(),
  description: z.string().nullish(),
  type: z.string().nullish(),
  modelType: z.string().nullish(),
  specification: z
    .object({
      provider: z.string().nullish(),
      modelId: z.string().nullish(),
    })
    .nullish(),
  context_window: z.number().nullable().optional(),
  max_tokens: z.number().nullable().optional(),
  modalities: z
    .object({
      input: z.array(z.string()).optional(),
      output: z.array(z.string()).optional(),
    })
    .optional(),
});

function error(
  statusCode: number,
  message: string,
): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function aiGatewayFailure(
  cause: unknown,
  model: string,
): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const candidate = cause as {
    name?: unknown;
    message?: unknown;
    statusCode?: unknown;
    status?: unknown;
  };
  const name = String(candidate?.name ?? '').toLowerCase();
  const message = String(candidate?.message ?? '').toLowerCase();
  const status = Number(candidate?.statusCode ?? candidate?.status ?? 0);

  if (
    status === 401 ||
    status === 403 ||
    name.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('invalid api key')
  ) {
    return {
      code: 'ai_gateway_authentication_failed',
      message:
        'Vercel AI Gateway rejected the saved key. Replace the key on the Developer page and try again.',
      retryable: false,
    };
  }

  if (
    status === 404 ||
    name.includes('modelnotfound') ||
    message.includes('model not found') ||
    message.includes('no such model')
  ) {
    return {
      code: 'ai_gateway_model_unavailable',
      message: `The selected model “${model}” is not available through Vercel AI Gateway. Choose another model from the list.`,
      retryable: false,
    };
  }

  if (status === 429 || message.includes('rate limit')) {
    return {
      code: 'ai_gateway_rate_limited',
      message:
        'Vercel AI Gateway is rate-limiting this request. Wait a moment and try again.',
      retryable: true,
    };
  }

  return {
    code: 'ai_gateway_request_failed',
    message: `The selected model “${model}” could not complete this comparison. Check the model choice and try again.`,
    retryable: status >= 500 || status === 0,
  };
}

function dashboardOrigins(): string[] {
  return (process.env.DEAL_DASHBOARD_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function missingProfessionalContext(
  requiredContext: string[],
  context: Record<string, unknown>,
): string[] {
  return requiredContext.filter((field) => {
    const value = context[field];
    return (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  });
}

function professionalPolicyRules(professional: {
  profileId?: string;
  restrictedActions?: string[];
  approvalActions?: string[];
}): PolicyRule[] {
  // These rules are consulted only by action authorization endpoints. They
  // must never turn a context read, persona render, or cognition route into an
  // approval request.
  const profileId = professional.profileId ?? 'professional';
  return [
    ...(professional.restrictedActions ?? []).map((action) => ({
      id: `${profileId}.restricted.${action}`,
      action,
      decision: 'deny' as const,
      reason: `Action '${action}' is restricted by the selected professional profile`,
    })),
    ...(professional.approvalActions ?? []).map((action) => ({
      id: `${profileId}.approval.${action}`,
      action,
      decision: 'require_approval' as const,
      reason: `Action '${action}' requires human approval for the selected professional profile`,
    })),
  ];
}

function normalizeArtifactPath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '..' || part === '')
  )
    throw error(400, `Invalid skill artifact path: ${value}`);
  return normalized;
}

function skillAttestation(entry: SkillRegistryEntry) {
  if (!entry.signature || !entry.signingKeyId || !entry.signedAt)
    throw error(503, 'Approved skill is missing a signing attestation');
  return SkillAttestationSchema.parse({
    registryId: entry.id,
    organizationId: entry.organizationId,
    name: entry.name,
    version: entry.version,
    contentHash: entry.descriptor.contentHash,
    bundleHash: entry.manifest.bundleHash,
    reviewStatus: 'approved',
    signature: entry.signature,
    signingKeyId: entry.signingKeyId,
    signedAt: entry.signedAt,
  });
}

function signingPayloadForSkill(entry: SkillRegistryEntry) {
  if (!entry.descriptor.contentHash)
    throw error(503, 'Registered skill is missing its content hash');
  return {
    registryId: entry.id,
    organizationId: entry.organizationId,
    name: entry.name,
    version: entry.version,
    contentHash: entry.descriptor.contentHash,
    bundleHash: entry.manifest.bundleHash,
    descriptor: entry.descriptor,
    manifest: entry.manifest,
  };
}

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) throw error(401, 'Bearer token required');
  return value.slice('Bearer '.length);
}

async function requireCredentialWithAuth(
  store: DealStore,
  request: FastifyRequest,
  kind?: Credential['kind'],
  externalAuth?: ExternalAuthProvider,
  auth?: DealAuth,
): Promise<Credential> {
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length)
    : undefined;
  let credential = token ? store.authenticate(token) : undefined;
  if (!credential && token && externalAuth) {
    try {
      const principal = await externalAuth.verify(token);
      const identity = store.findExternalIdentity(
        principal.issuer,
        principal.subject,
      );
      if (identity) {
        credential = {
          id: `external:${identity.issuer}:${identity.subject}`,
          tokenHash: '',
          kind: 'human',
          humanId: identity.humanId,
        };
      }
    } catch {
      // Treat provider verification failures like invalid credentials.
    }
  }
  if (!credential && auth) {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      const user = session?.user;
      if (user) {
        const human = store.findHumanByExternalIdentity(
          betterAuthIssuer,
          user.id,
        );
        if (human) {
          credential = {
            id: `better-auth:${user.id}`,
            tokenHash: '',
            kind: 'human',
            humanId: human.id,
          };
        }
      }
    } catch {
      // Treat missing or expired Better Auth sessions like invalid credentials.
    }
  }
  if (!credential)
    throw error(
      401,
      token ? 'Invalid or revoked credential' : 'Authentication required',
    );
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

function metricRoute(request: FastifyRequest): string {
  return (
    request.routeOptions.url ??
    request.url
      .split('?')[0]!
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/\d+(?=\/|$)/gi, '/:id')
  );
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
  const redactions: string[] = [];
  const scoped = (path: string, facts: ProfileFact[]): ProfileFact[] => {
    const visible = visibleFacts(facts, includeSensitiveContext);
    if (visible.length !== facts.length) redactions.push(path);
    return visible;
  };
  const scopedIdentity = <T extends { visibility: string }>(
    path: string,
    attribute: T | undefined,
  ): T | undefined => {
    if (!attribute) return undefined;
    if (!includeSensitiveContext || attribute.visibility === 'never_share') {
      redactions.push(path);
      return undefined;
    }
    return attribute;
  };
  const scopedIdentityList = <T extends { visibility: string }>(
    path: string,
    attributes: T[],
  ): T[] => {
    const visible = includeSensitiveContext
      ? attributes.filter((attribute) => attribute.visibility !== 'never_share')
      : [];
    if (visible.length !== attributes.length) redactions.push(path);
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
    genderIdentity: scopedIdentity(
      'humanModel.identity.genderIdentity',
      model.identity.genderIdentity,
    ),
    raceEthnicity: scopedIdentityList(
      'humanModel.identity.raceEthnicity',
      model.identity.raceEthnicity,
    ),
    culturalBackground: scopedIdentityList(
      'humanModel.identity.culturalBackground',
      model.identity.culturalBackground,
    ),
    nationality: scopedIdentityList(
      'humanModel.identity.nationality',
      model.identity.nationality,
    ),
    personalBackground: scopedIdentityList(
      'humanModel.identity.personalBackground',
      model.identity.personalBackground,
    ),
    religionOrBelief: scopedIdentity(
      'humanModel.identity.religionOrBelief',
      model.identity.religionOrBelief,
    ),
    sexualOrientation: scopedIdentity(
      'humanModel.identity.sexualOrientation',
      model.identity.sexualOrientation,
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
    if (includeSensitiveContext || relationship.sensitivity !== 'sensitive')
      return true;
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

async function compileDashboardContext(input: {
  store: DealStore;
  human: Human;
  agent: Agent;
  delegation: Delegation;
  task: string;
  contextTtlMinutes: number;
}) {
  const { store, human, agent, delegation, task, contextTtlMinutes } = input;
  const includeSensitiveContext = delegation.authority.mayRead.includes(
    'sensitive_context_read',
  );

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
  const cognition = routeTaskCognition({
    task,
    humanRole: human.role,
    declaredProfession: domain.profession ?? delegation.profileId,
    domain: [domain.industry, domain.specialization, ...domain.goals].filter(
      (value): value is string => Boolean(value),
    ),
  });
  const selectedProfessionId =
    delegation.profileId ?? domain.profession ?? 'generalist_assistant_v1';
  const selectedProfession =
    getProfessionProfile(selectedProfessionId) ??
    getProfessionProfile('generalist_assistant_v1');
  const professionalContext = selectedProfession
    ? {
        profileId: selectedProfession?.id ?? selectedProfessionId,
        profileVersion: selectedProfession.version,
        title: selectedProfession.title,
        subjectType: selectedProfession.subjectType,
        category: selectedProfession.category,
        role: human.role || selectedProfession.title,
        industry: domain.industry,
        specialization: domain.specialization,
        seniority: domain.seniority,
        jurisdictions: domain.jurisdictions,
        objective: selectedProfession.objective,
        responsibilities: selectedProfession.responsibilities,
        knowledgeAreas: selectedProfession.knowledgeAreas,
        operatingPatterns: selectedProfession.operatingPatterns,
        communicationPatterns: selectedProfession.communicationPatterns,
        decisionPatterns: selectedProfession.decisionPatterns,
        failureModes: selectedProfession.failureModes,
        escalationTriggers: selectedProfession.escalationTriggers,
        safetyBoundaries: selectedProfession.safetyBoundaries,
        sensitiveDataClasses: selectedProfession.sensitiveDataClasses,
        regulated: selectedProfession.regulated,
        licenseRequiredFor: selectedProfession.licenseRequiredFor,
        restrictedActions: selectedProfession.restrictedActions,
        approvalActions: selectedProfession.approvalActions,
        contextAccess: 'automatic' as const,
        requiredContext: selectedProfession.requiredContext,
        missingContext: missingProfessionalContext(
          selectedProfession.requiredContext,
          {
            ...domain,
            role: human.role,
            communicationStyle: persona.communicationStyle,
            goal: task,
            constraints: human.knownConstraints,
          },
        ),
        humanFacts: visibleFacts(
          biography.domainExpertise,
          includeSensitiveContext,
        ),
        source: selectedProfession.source,
      }
    : undefined;

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
    query: task,
    limit: 24,
  });
  const hitMap = new Map(
    [...criticalHits, ...baselineHits, ...taskHits].map((hit) => [hit.id, hit]),
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
        typeof hit.content === 'string' ? { value: hit.content } : hit.content,
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
    task,
    persona,
    domain,
    memory,
    authority: delegation.authority,
    judgment,
    professional: professionalContext,
    cognition,
    humanModel: scopedHumanModel.model,
    interaction: {
      taskMetadata: { surface: 'dashboard_compare' },
      channel: 'dashboard',
      audience: human.displayName,
      openLoops: [],
      recentTurns: [],
    },
    grounding,
    redactions: scopedHumanModel.redactions,
    policyVersion: delegation.profileId ?? 'default_v1',
    ttlMinutes: contextTtlMinutes,
    memoryReferences: memory.references,
    skills: [],
    skillAttestations: [],
  });
  return { packet, memoryCount: hits.length };
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
  const configuredCredentialKey =
    options.credentialEncryptionKey ??
    process.env.DEAL_CREDENTIAL_ENCRYPTION_KEY;
  if (
    process.env.NODE_ENV === 'production' &&
    (!configuredCredentialKey || configuredCredentialKey.length < 32)
  )
    throw new Error(
      'DEAL_CREDENTIAL_ENCRYPTION_KEY must be configured with at least 32 characters in production',
    );
  // Development can safely derive this from the JWT secret to keep local setup
  // simple. Production must use a dedicated secret so rotating JWT signing does
  // not make stored provider keys unreadable.
  const credentialEncryptionKey = configuredCredentialKey ?? jwtSecret;
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.DEAL_DASHBOARD_ORIGIN
  )
    throw new Error('DEAL_DASHBOARD_ORIGIN must be configured in production');
  const contextTtlMinutes =
    options.contextTtlMinutes ??
    Number(process.env.DEAL_CONTEXT_TTL_MINUTES ?? 15);
  const metrics = options.metrics ?? new MetricsRegistry();
  const rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter();
  const globalRateLimit =
    options.rateLimitPerMinute ??
    Number(process.env.DEAL_RATE_LIMIT_PER_MINUTE ?? 120);
  const contextRateLimit =
    options.contextRateLimitPerMinute ??
    Number(process.env.DEAL_CONTEXT_RATE_LIMIT_PER_MINUTE ?? 30);
  const skillSigner =
    options.skillSigner ??
    new SkillSigner({
      privateKeyPem: process.env.DEAL_SKILL_SIGNING_PRIVATE_KEY,
      publicKeyPem: process.env.DEAL_SKILL_SIGNING_PUBLIC_KEY,
      keyId: process.env.DEAL_SKILL_SIGNING_KEY_ID,
    });
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
    bodyLimit: Number(process.env.DEAL_BODY_LIMIT_BYTES ?? 8_388_608),
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    },
  }) as unknown as FastifyInstance & { dealStore: DealStore };
  app.decorate('dealStore', store);
  async function requireCredential(
    requestStore: DealStore,
    request: FastifyRequest,
    kind?: Credential['kind'],
    externalAuth?: ExternalAuthProvider,
  ): Promise<Credential> {
    return requireCredentialWithAuth(
      requestStore,
      request,
      kind,
      externalAuth,
      options.auth,
    );
  }
  app.addHook('onRequest', async (request, reply) => {
    const requestPath = request.url.split('?')[0];
    // CORS preflight must stay available while the durable store is
    // reconnecting. The actual request still waits for store.ready below.
    // Better Auth talks directly to the same Postgres pool and does not use
    // DealStore's in-memory snapshot, so auth requests must not be blocked by
    // an unrelated snapshot hydration during a brief database reconnect.
    if (request.method === 'OPTIONS' || requestPath.startsWith('/api/auth/')) {
      reply.header('X-Request-ID', request.id);
      (request as FastifyRequest & { dealStartedAt?: number }).dealStartedAt =
        Date.now();
      return;
    }
    await store.ready;
    await store.beginRequest(request.id);
    reply.header('X-Request-ID', request.id);
    (request as FastifyRequest & { dealStartedAt?: number }).dealStartedAt =
      Date.now();
  });
  app.addHook('onRequest', async (request, reply) => {
    const configuredOrigins = dashboardOrigins();
    const requestOrigin = request.headers.origin;
    const origin =
      typeof requestOrigin === 'string' &&
      (configuredOrigins.length === 0 ||
        configuredOrigins.includes(requestOrigin))
        ? requestOrigin
        : (configuredOrigins[0] ?? '*');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Idempotency-Key, X-Request-ID',
    );
    reply.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.method === 'OPTIONS' ||
      ['/healthz', '/readyz', '/metrics'].includes(request.url.split('?')[0])
    )
      return;
    const token = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice('Bearer '.length)
      : undefined;
    const identity = token
      ? `credential:${hashToken(token)}`
      : `ip:${request.ip}`;
    const isContext = request.url.split('?')[0] === '/v1/context';
    const result = await rateLimiter.consume(
      `${identity}:${isContext ? 'context' : 'global'}`,
      isContext ? contextRateLimit : globalRateLimit,
      60,
    );
    reply.header('RateLimit-Limit', String(result.limit));
    reply.header('RateLimit-Remaining', String(result.remaining));
    reply.header('RateLimit-Reset', String(result.retryAfterSeconds));
    if (!result.allowed) {
      metrics.increment('deal_rate_limit_rejections_total', {
        scope: isContext ? 'context' : 'global',
      });
      reply.header('Retry-After', String(result.retryAfterSeconds));
      return reply
        .code(429)
        .send({ error: 'Rate limit exceeded', requestId: request.id });
    }
  });
  app.addHook('onSend', async (request) => {
    await store.endRequest(request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    const startedAt =
      (request as FastifyRequest & { dealStartedAt?: number }).dealStartedAt ??
      Date.now();
    const route = metricRoute(request);
    metrics.increment('deal_http_requests_total', {
      method: request.method,
      route,
      status: String(reply.statusCode),
    });
    metrics.observe(
      'deal_http_request_duration_seconds',
      (Date.now() - startedAt) / 1000,
      { route },
    );
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route,
        statusCode: reply.statusCode,
      },
      'request completed',
    );
  });

  app.get('/healthz', async () => ({ status: 'ok', service: 'deal-api' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      const health = await store.health();
      return { status: health.ok ? 'ready' : 'not_ready', ...health };
    } catch {
      return reply.code(503).send({ status: 'not_ready', durable: true });
    }
  });
  app.get('/metrics', async (request, reply) => {
    const configuredToken = process.env.DEAL_METRICS_TOKEN;
    if (configuredToken) {
      const token = request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice('Bearer '.length)
        : '';
      if (token !== configuredToken)
        return reply
          .code(401)
          .send({ error: 'Metrics authentication required' });
    }
    reply.type('text/plain; version=0.0.4');
    return metrics.renderPrometheus();
  });

  if (options.auth) {
    const auth = options.auth;
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      handler: async (request, reply) => {
        const protocol =
          request.headers['x-forwarded-proto']?.toString().split(',')[0] ??
          (process.env.NODE_ENV === 'production' ? 'https' : 'http');
        const host =
          request.headers['x-forwarded-host']?.toString() ??
          request.headers.host ??
          `localhost:${process.env.DEAL_PORT ?? '3000'}`;
        const url = new URL(request.url, `${protocol}://${host}`);
        const headers = fromNodeHeaders(request.headers);
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const authRequest = new Request(url, {
          method: request.method,
          headers,
          ...(hasBody
            ? { body: JSON.stringify(request.body ?? {}) }
            : undefined),
        });
        let response: Response;
        try {
          response = await auth.handler(authRequest);
        } catch (cause) {
          request.log.error({ err: cause }, 'Better Auth request failed');
          return reply.code(503).send({
            message: 'Authentication is temporarily unavailable. Try again.',
            code: 'AUTH_SERVICE_UNAVAILABLE',
          });
        }
        const headersWithCookies = response.headers as Headers & {
          getSetCookie?: () => string[];
        };
        const setCookies = headersWithCookies.getSetCookie?.();
        response.headers.forEach((value: string, key: string) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        if (setCookies?.length) reply.header('set-cookie', setCookies);
        const body = await response.text();
        return reply.code(response.status).send(body || null);
      },
    });
  }

  app.post('/v1/auth/provision', async (request) => {
    if (!options.auth) throw error(503, 'Better Auth is not configured');
    let user: { id: string; email: string; name: string } | undefined;
    try {
      const session = await options.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (session?.user)
        user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        };
    } catch {
      // Fall through to the consistent authentication error below.
    }
    if (!user) throw error(401, 'A Better Auth session is required');

    const existingIdentity = store.findExternalIdentity(
      betterAuthIssuer,
      user.id,
    );
    if (existingIdentity) {
      const human = store.humans.get(existingIdentity.humanId);
      if (!human)
        throw error(409, 'Auth identity is linked to a missing human');
      const agent = [...store.agents.values()].find(
        (item) => item.ownerHumanId === human.id,
      );
      return {
        provisioned: false,
        onboardingCompleted: Boolean(human.onboarding?.completedAt),
        human: {
          id: human.id,
          email: human.email,
          displayName: human.displayName,
          organizationId: human.organizationId,
        },
        agent,
      };
    }

    // Reuse the validated demo profile as a complete, neutral starting model
    // rather than creating a shallow identity with missing context fields.
    const templateStore = new DealStore();
    await templateStore.seedDemo('template-agent-key', 'template-human-key');
    const template = templateStore.humans.get('human_demo');
    if (!template) throw error(500, 'Could not initialize the human model');
    const humanId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const delegationId = crypto.randomUUID();
    const displayName = user.name.trim() || user.email.split('@')[0] || 'Owner';
    const human = structuredClone(template);
    human.id = humanId;
    human.email = user.email;
    human.displayName = displayName;
    human.organizationId = organizationId;
    human.role = 'Owner';
    human.identity = {
      ...human.identity,
      preferredName: displayName,
      organization: `${displayName}'s human model`,
      mission: 'Make better decisions with context, continuity, and care.',
    };
    human.persona = {
      ...human.persona,
      displayName,
      role: 'Owner',
      communicationStyle: 'clear, natural, context-aware',
      values: [],
      avoidedPhrases: [],
    };
    human.selfConcept = {
      ...human.selfConcept,
      summary: 'A person building a useful, trustworthy relationship with AI.',
      identityStatements: [],
      strengths: [],
      nonNegotiables: [],
      valuesHierarchy: [],
      howTheyDescribeThemselves: [],
    };
    human.biography = {
      ...human.biography,
      summary: '',
      currentChapter: '',
      domainExpertise: [],
    };
    human.domain = {
      ...human.domain,
      business: '',
      icp: '',
      offer: '',
      exclusions: [],
      goals: [],
      terminology: {},
    };
    human.decision = {
      ...human.decision,
      priorities: [],
      tradeoffs: [],
      northStars: [],
      asksBeforeCommitment: ['consequential actions'],
      autonomyPreferences: ['draft freely', 'ask before commitment'],
      redLines: [],
      heuristics: [],
      examples: [],
    };
    human.behavior = {
      ...human.behavior,
      askBefore: ['consequential actions'],
      neverDo: [],
      responsePrinciples: [
        'be honest about uncertainty',
        'preserve the human voice',
      ],
      neverClaim: ['work not performed', 'certainty not supported by evidence'],
      neverImpersonate: true,
    };
    human.currentPriorities = [];
    human.knownConstraints = [];
    human.judgment = {
      ...human.judgment,
      askIfMissing: ['goal', 'audience', 'tone'],
      escalateIf: ['legal, financial, or reputational exposure'],
      refuseIf: ['deception', 'unauthorized data use'],
      confidenceThreshold: 0.7,
    };
    store.humans.set(human.id, human);

    const agent = {
      id: agentId,
      name: `${displayName}'s first agent`,
      runtime: 'api',
      ownerHumanId: human.id,
      status: 'active' as const,
    };
    store.agents.set(agent.id, agent);
    store.delegations.set(delegationId, {
      id: delegationId,
      humanId: human.id,
      agentId: agent.id,
      purpose: 'Provide bounded context and humanized responses',
      authority: {
        mayRead: ['context_read', 'memory_read'],
        mayDraft: ['response_draft'],
        mayWrite: ['memory_write'],
        requiresApproval: ['external_commitment'],
      },
      policyRules: [],
    });
    store.linkExternalIdentity({
      organizationId,
      humanId,
      issuer: betterAuthIssuer,
      subject: user.id,
      email: user.email,
      claims: { provider: 'email-password' },
    });
    store.recordAudit({
      humanId,
      organizationId,
      agentId,
      eventType: 'auth.account_provisioned',
      payload: { authProvider: betterAuthIssuer, authUserId: user.id },
    });
    return {
      provisioned: true,
      onboardingCompleted: false,
      human: {
        id: human.id,
        email: human.email,
        displayName: human.displayName,
        organizationId: human.organizationId,
      },
      agent,
    };
  });

  app.post('/v1/auth/external/link', async (request) => {
    if (!options.externalAuth)
      throw error(503, 'External authentication is not configured');
    const credential = await requireCredential(
      store,
      request,
      'human',
      undefined,
    );
    const body = parse(z.object({ token: z.string().min(1) }), request.body);
    let principal;
    try {
      principal = await options.externalAuth.verify(body.token);
    } catch {
      throw error(401, 'External identity token could not be verified');
    }
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const identity = store.linkExternalIdentity({
      organizationId: human.organizationId,
      humanId: human.id,
      issuer: principal.issuer,
      subject: principal.subject,
      email: principal.email,
      claims: principal.claims,
    });
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'external_identity.linked',
      payload: { issuer: identity.issuer, subject: identity.subject },
    });
    return {
      id: identity.id,
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
    };
  });

  app.post('/v1/agents', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(
      z.object({
        name: z.string().min(1),
        runtime: z.string().min(1),
        createApiKey: z.boolean().default(true),
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
    const apiKey = body.createApiKey
      ? store.issueCredential({
          kind: 'agent',
          humanId: credential.humanId,
          agentId: agent.id,
          expiresAt: body.credentialExpiresAt,
          name: `${agent.name} key`,
        })
      : undefined;
    store.recordAudit({
      humanId: credential.humanId,
      organizationId:
        store.humans.get(credential.humanId)?.organizationId ?? '',
      agentId: agent.id,
      eventType: 'agent.created',
      payload: { agentId: agent.id },
    });
    return { agent, ...(apiKey ? { apiKey } : {}) };
  });

  app.get('/v1/agents', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const now = Date.now();
    const agents = [...store.agents.values()]
      .filter((agent) => agent.ownerHumanId === credential.humanId)
      .map((agent) => ({
        ...agent,
        credentials: [...store.credentials.values()]
          .filter((item) => item.agentId === agent.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            createdAt: item.createdAt,
            active:
              !item.revokedAt &&
              (!item.expiresAt || new Date(item.expiresAt).getTime() > now),
            expiresAt: item.expiresAt,
            revokedAt: item.revokedAt,
          })),
      }));
    return { agents };
  });

  app.post('/v1/agents/:agentId/credentials', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const params = request.params as { agentId: string };
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        credentialExpiresAt: z.string().datetime().optional(),
      }),
      request.body,
    );
    const agent = store.agents.get(params.agentId);
    if (!agent || agent.ownerHumanId !== credential.humanId)
      throw error(404, 'Agent not found');
    const name = body.name ?? `${agent.name} key`;
    const apiKey = store.issueCredential({
      kind: 'agent',
      humanId: credential.humanId,
      agentId: agent.id,
      name,
      expiresAt: body.credentialExpiresAt,
    });
    const created = [...store.credentials.values()].find(
      (item) =>
        item.humanId === credential.humanId &&
        item.agentId === agent.id &&
        item.name === name &&
        item.tokenHash === hashToken(apiKey),
    );
    const human = store.humans.get(credential.humanId)!;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: agent.id,
      eventType: 'credential.created',
      payload: { credentialId: created?.id, agentId: agent.id },
    });
    return {
      agentId: agent.id,
      apiKey,
      credential: created
        ? {
            id: created.id,
            name: created.name,
            createdAt: created.createdAt,
            expiresAt: created.expiresAt,
          }
        : undefined,
    };
  });

  app.post('/v1/agents/:agentId/credentials/rotate', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const params = request.params as { agentId: string };
    const body = parse(
      z.object({
        credentialExpiresAt: z.string().datetime().optional(),
        name: z.string().trim().min(1).max(80).optional(),
      }),
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
      name: body.name ?? `${agent.name} key`,
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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

  app.get('/v1/developer/ai-gateway', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const saved = store.getActiveAiGatewayCredential(credential.humanId);
    if (!saved)
      return {
        configured: false,
        provider: 'vercel_ai_gateway' as const,
      };
    return {
      configured: true,
      provider: saved.provider,
      model: saved.model,
      keyHint: saved.keyHint,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  });

  app.get('/v1/developer/ai-gateway/models', async (request, reply) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const saved = store.getActiveAiGatewayCredential(human.id);
    let gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
    const customCatalogUrl =
      options.aiGatewayModelsUrl ?? process.env.DEAL_AI_GATEWAY_MODELS_URL;
    if (saved) {
      try {
        gatewayKey = decryptSecret(
          saved.encryptedApiKey,
          credentialEncryptionKey,
        );
      } catch (cause) {
        request.log.error(
          { err: cause, humanId: human.id },
          'Saved AI gateway credential could not be decrypted',
        );
        return reply.code(503).send({
          error:
            'Your saved AI key is temporarily unavailable. Replace it on the Developer page or contact support.',
          requestId: request.id,
        });
      }
    }
    if (!gatewayKey && !customCatalogUrl)
      return reply.code(503).send({
        error:
          'Add your Vercel AI Gateway key on the Developer page before choosing a model.',
        code: 'ai_gateway_not_configured',
        requestId: request.id,
      });
    try {
      let catalog: unknown;
      if (customCatalogUrl) {
        const response = await (options.fetchImpl ?? fetch)(customCatalogUrl, {
          headers: gatewayKey
            ? { Authorization: `Bearer ${gatewayKey}` }
            : undefined,
          signal: AbortSignal.timeout(7_500),
        });
        if (!response.ok)
          return reply.code(502).send({
            error: 'The AI Gateway model list could not be loaded.',
            requestId: request.id,
          });
        catalog = await response.json();
      } else {
        const gateway = createGateway({
          apiKey: gatewayKey,
          ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
        });
        catalog = await gateway.getAvailableModels();
      }

      const body = z
        .object({
          models: z.array(aiGatewayModelSchema).optional(),
          data: z.array(aiGatewayModelSchema).optional(),
        })
        .parse(catalog);
      const models = (body.models ?? body.data ?? [])
        .filter(
          (model) =>
            (model.modelType ?? model.type ?? 'language') === 'language' &&
            model.modalities?.output?.includes('text') !== false,
        )
        .map((model) => ({
          id: model.id,
          name: model.name ?? model.id,
          provider:
            model.specification?.provider ??
            model.owned_by ??
            model.id.split('/')[0],
          description: model.description ?? '',
          ...(model.context_window == null
            ? {}
            : { contextWindow: model.context_window }),
          ...(model.max_tokens == null ? {} : { maxTokens: model.max_tokens }),
        }))
        .sort((left, right) =>
          `${left.provider}/${left.name}`.localeCompare(
            `${right.provider}/${right.name}`,
          ),
        );
      return { models };
    } catch (cause) {
      request.log.warn({ err: cause }, 'AI Gateway model list failed');
      return reply.code(502).send({
        error: 'The AI Gateway model list could not be loaded.',
        requestId: request.id,
      });
    }
  });

  app.put('/v1/developer/ai-gateway', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(aiGatewayCredentialBody, request.body);
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const now = new Date().toISOString();
    for (const saved of store.aiGatewayCredentials.values()) {
      if (saved.humanId === human.id && !saved.revokedAt) saved.revokedAt = now;
    }
    const saved = {
      id: crypto.randomUUID(),
      humanId: human.id,
      provider: 'vercel_ai_gateway' as const,
      encryptedApiKey: encryptSecret(body.apiKey, credentialEncryptionKey),
      keyHint: credentialKeyHint(body.apiKey),
      model: body.model,
      createdAt: now,
      updatedAt: now,
    };
    store.aiGatewayCredentials.set(saved.id, saved);
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'ai_gateway.credential_saved',
      payload: {
        credentialId: saved.id,
        provider: saved.provider,
        model: saved.model,
        keyHint: saved.keyHint,
      },
    });
    return {
      configured: true,
      provider: saved.provider,
      model: saved.model,
      keyHint: saved.keyHint,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  });

  app.patch('/v1/developer/ai-gateway', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(aiGatewayModelUpdateBody, request.body);
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const saved = store.getActiveAiGatewayCredential(human.id);
    if (!saved)
      throw error(409, 'Save an AI Gateway key before choosing a model');
    saved.model = body.model;
    saved.updatedAt = new Date().toISOString();
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'ai_gateway.model_updated',
      payload: {
        credentialId: saved.id,
        provider: saved.provider,
        model: saved.model,
      },
    });
    return {
      configured: true,
      provider: saved.provider,
      model: saved.model,
      keyHint: saved.keyHint,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  });

  app.delete('/v1/developer/ai-gateway', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const saved = store.getActiveAiGatewayCredential(human.id);
    if (saved) {
      saved.revokedAt = new Date().toISOString();
      store.recordAudit({
        humanId: human.id,
        organizationId: human.organizationId,
        eventType: 'ai_gateway.credential_revoked',
        payload: { credentialId: saved.id, provider: saved.provider },
      });
    }
    return { revoked: Boolean(saved) };
  });

  app.post('/v1/delegations', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    return {
      human,
      delegations: [...store.delegations.values()].filter(
        (item) => item.humanId === human.id && !item.revokedAt,
      ),
    };
  });

  app.post('/v1/experiments/compare', async (request, reply) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(comparisonBody, request.body);
    if (body.image && !body.image.data.startsWith('data:image/'))
      throw error(400, 'Image data must be a data URL');

    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const savedGatewayCredential = store.getActiveAiGatewayCredential(human.id);
    let model = process.env.AI_GATEWAY_MODEL?.trim();
    let gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
    let credentialSource: 'saved' | 'server' = 'server';
    if (savedGatewayCredential) {
      try {
        gatewayKey = decryptSecret(
          savedGatewayCredential.encryptedApiKey,
          credentialEncryptionKey,
        );
      } catch (cause) {
        request.log.error(
          { err: cause, humanId: human.id },
          'Saved AI gateway credential could not be decrypted',
        );
        return reply.code(503).send({
          error:
            'Your saved AI key is temporarily unavailable. Replace it on the Developer page or contact support.',
          requestId: request.id,
        });
      }
      model = savedGatewayCredential.model;
      credentialSource = 'saved';
    }
    if (!model || !gatewayKey)
      return reply.code(503).send({
        error:
          'AI comparison is not configured. Add your AI Gateway key on the Developer page or configure AI_GATEWAY_API_KEY and AI_GATEWAY_MODEL on the API.',
        requestId: request.id,
      });
    const requestedAgent = body.agentId
      ? store.agents.get(body.agentId)
      : [...store.agents.values()].find(
          (item) => item.ownerHumanId === human.id && item.status === 'active',
        );
    if (!requestedAgent || requestedAgent.ownerHumanId !== human.id)
      throw error(404, 'Connect an agent before running a comparison');
    if (requestedAgent.status !== 'active')
      throw error(409, 'This agent is paused');
    const delegation = store.getDelegationForAgent(requestedAgent.id, human.id);
    if (!delegation) throw error(409, 'This agent has no active permission');

    const { packet, memoryCount } = await compileDashboardContext({
      store,
      human,
      agent: requestedAgent,
      delegation,
      task: body.task,
      contextTtlMinutes,
    });
    const signature = await new SignJWT(
      packet as unknown as Record<string, unknown>,
    )
      .setProtectedHeader({ alg: 'HS256', typ: 'DEAL-CTX' })
      .setSubject(packet.packetId)
      .setAudience(requestedAgent.id)
      .setIssuedAt(Math.floor(new Date(packet.issuedAt).getTime() / 1000))
      .setExpirationTime(
        Math.floor(new Date(packet.expiresAt).getTime() / 1000),
      )
      .sign(keyFromSecret(jwtSecret));
    store.contexts.set(packet.packetId, {
      packet,
      signature,
      humanId: human.id,
      agentId: requestedAgent.id,
      createdAt: packet.issuedAt,
    });

    const maxOutputTokens = process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS
      ? Number(process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS)
      : undefined;
    const temperature = process.env.AI_GATEWAY_TEMPERATURE
      ? Number(process.env.AI_GATEWAY_TEMPERATURE)
      : undefined;
    // Always resolve the selected provider/model through the Gateway provider.
    // Passing "provider/model" directly to generateText only works when the
    // global AI SDK provider is configured, which is not true for per-person
    // saved keys and caused dashboard comparisons to fail at runtime.
    const gateway = createGateway({ apiKey: gatewayKey });
    const generationOptions = {
      model: gateway.languageModel(model),
      ...(Number.isFinite(maxOutputTokens) && maxOutputTokens! > 0
        ? { maxOutputTokens }
        : {}),
      ...(Number.isFinite(temperature) && temperature! >= 0
        ? { temperature }
        : {}),
    };

    const run = (system?: string) =>
      body.image
        ? generateText({
            ...generationOptions,
            ...(system ? { system } : {}),
            messages: [
              {
                role: 'user' as const,
                content: [
                  { type: 'text' as const, text: body.task },
                  {
                    type: 'file' as const,
                    data: body.image.data,
                    mediaType: body.image.mediaType,
                    filename: body.image.name,
                  },
                ],
              },
            ],
          })
        : generateText({
            ...generationOptions,
            ...(system ? { system } : {}),
            prompt: body.task,
          });

    let rawResult: Awaited<ReturnType<typeof generateText>>;
    let humanizedResult: Awaited<ReturnType<typeof generateText>>;
    try {
      [rawResult, humanizedResult] = await Promise.all([
        run(),
        run(renderDealContext(packet)),
      ]);
    } catch (cause) {
      request.log.error({ err: cause, model }, 'AI comparison failed');
      const failure = aiGatewayFailure(cause, model);
      return reply.code(502).send({
        error: failure.message,
        code: failure.code,
        retryable: failure.retryable,
        requestId: request.id,
      });
    }

    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      agentId: requestedAgent.id,
      eventType: 'experiment.compared',
      payload: {
        packetId: packet.packetId,
        model,
        credentialSource,
        memoryCount,
        hasImage: Boolean(body.image),
        cognition: {
          routeId: packet.cognition?.routeId,
          profileId: packet.cognition?.profileId,
          category: packet.cognition?.category,
          risk: packet.cognition?.risk,
          confidence: packet.cognition?.confidence,
        },
      },
    });
    return {
      task: body.task,
      model,
      raw: {
        text: rawResult.text,
        finishReason: rawResult.finishReason,
        usage: rawResult.usage,
      },
      humanized: {
        text: humanizedResult.text,
        finishReason: humanizedResult.finishReason,
        usage: humanizedResult.usage,
      },
      context: {
        packetId: packet.packetId,
        expiresAt: packet.expiresAt,
        policyVersion: packet.policyVersion,
        professionalProfile: packet.professional.profileId,
        cognition: packet.cognition
          ? {
              routeId: packet.cognition.routeId,
              profileId: packet.cognition.profileId,
              category: packet.cognition.category,
              risk: packet.cognition.risk,
              confidence: packet.cognition.confidence,
              signals: packet.cognition.signals,
            }
          : undefined,
        memoryReferences: memoryCount,
        agentId: requestedAgent.id,
      },
    };
  });

  app.get('/v1/profiles', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    return profileRegistry;
  });

  app.get('/v1/professions', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const query = request.query as { search?: string; category?: string };
    const profiles = query.search
      ? searchProfessionProfiles(query.search)
      : professionCatalog;
    return query.category
      ? profiles.filter((profile) => profile.category === query.category)
      : profiles;
  });

  app.get('/v1/professions/:professionId', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const params = request.params as { professionId: string };
    const profile = getProfessionProfile(params.professionId);
    if (!profile) throw error(404, 'Profession profile not found');
    return profile;
  });

  app.get('/v1/life-contexts', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const query = request.query as { search?: string; category?: string };
    const search = query.search?.trim().toLowerCase();
    const profiles = lifeContextStructures.filter((profile) => {
      if (query.category && profile.category !== query.category) return false;
      if (!search) return true;
      return [
        profile.id,
        profile.title,
        profile.subjectType,
        profile.category,
        ...profile.aliases,
        ...profile.routingTerms,
        ...profile.knowledgeAreas,
        ...profile.responsibilities,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
    return profiles;
  });

  app.get('/v1/life-contexts/:lifeContextId', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const params = request.params as { lifeContextId: string };
    const profile = lifeContextStructures.find(
      (candidate) => candidate.id === params.lifeContextId,
    );
    if (!profile) throw error(404, 'Life context not found');
    return profile;
  });

  app.get('/v1/human-contexts', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const query = request.query as { search?: string; category?: string };
    const search = query.search?.trim().toLowerCase();
    const profiles = humanContextStructures.filter((profile) => {
      if (query.category && profile.category !== query.category) return false;
      if (!search) return true;
      return [
        profile.id,
        profile.title,
        profile.subjectType,
        profile.category,
        ...profile.aliases,
        ...profile.routingTerms,
        ...profile.knowledgeAreas,
        ...profile.responsibilities,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
    return profiles;
  });

  app.get('/v1/human-contexts/:humanContextId', async (request) => {
    await requireCredential(store, request, undefined, options.externalAuth);
    const params = request.params as { humanContextId: string };
    const profile = humanContextStructures.find(
      (candidate) => candidate.id === params.humanContextId,
    );
    if (!profile) throw error(404, 'Human context not found');
    return profile;
  });

  app.get('/v1/skills/keys', async (_request, reply) => {
    if (!skillSigner.configured)
      throw error(503, 'Skill signing keys are not configured');
    const publicKeys = new Map<string, string>();
    if (skillSigner.publicKeyPem)
      publicKeys.set(skillSigner.keyId, skillSigner.publicKeyPem);
    for (const entry of store.skillRegistry.values()) {
      if (entry.signingKeyId && entry.signingPublicKey)
        publicKeys.set(entry.signingKeyId, entry.signingPublicKey);
    }
    return reply.send({
      keys: [...publicKeys.entries()].map(([keyId, publicKeyPem]) => ({
        keyId,
        algorithm: skillSigner.algorithm,
        publicKeyPem,
      })),
    });
  });

  app.get('/v1/skills', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const query = request.query as {
      name?: string;
      status?: string;
    };
    const requestedStatus = query.status
      ? parse(SkillReviewStatusSchema, query.status)
      : undefined;
    return [...store.skillRegistry.values()]
      .filter((entry) => entry.organizationId === human.organizationId)
      .filter((entry) => !query.name || entry.name === query.name)
      .filter((entry) =>
        credential.kind === 'agent'
          ? entry.reviewStatus === 'approved' && !entry.revokedAt
          : !requestedStatus || entry.reviewStatus === requestedStatus,
      )
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          right.version.localeCompare(left.version),
      );
  });

  app.get('/v1/skills/:name/:version', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const params = request.params as { name: string; version: string };
    const entry = store.findSkill(
      human.organizationId,
      params.name,
      params.version,
    );
    if (
      !entry ||
      (credential.kind === 'agent' &&
        (entry.reviewStatus !== 'approved' || Boolean(entry.revokedAt)))
    )
      throw error(404, 'Skill version not found');
    return entry;
  });

  app.post('/v1/skills', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(
      z.object({
        name: z.string(),
        description: z.string().min(1).max(1024),
        version: z.string().min(1).max(128),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        license: z.string().max(256).optional(),
        compatibility: z.string().max(500).optional(),
        metadata: z.record(z.string()).default({}),
        artifactUri: z.string().min(1).max(2048).optional(),
        entrypoint: z.string().min(1).max(512).default('SKILL.md'),
        files: z.array(SkillArtifactFileSchema).max(256),
        bundleHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        reviewStatus: z.enum(['draft', 'pending_review']).default('draft'),
      }),
      request.body,
    );
    const human = store.humans.get(credential.humanId);
    if (!human) throw error(404, 'Human not found');
    const descriptor = SkillDescriptorSchema.parse({
      name: body.name,
      description: body.description,
      version: body.version,
      contentHash: body.contentHash,
      source: 'organization',
      license: body.license,
      compatibility: body.compatibility,
      metadata: body.metadata,
    });
    const entrypoint = body.entrypoint ?? 'SKILL.md';
    const files = body.files.map((file) => ({
      ...file,
      path: normalizeArtifactPath(file.path),
    }));
    const entrypointFile = files.find((file) => file.path === entrypoint);
    if (!entrypointFile || entrypointFile.kind !== 'skill')
      throw error(400, 'Skill manifest must include a skill entrypoint file');
    if (entrypointFile.sha256 !== descriptor.contentHash)
      throw error(400, 'Entrypoint hash must match the skill content hash');
    const computedBundleHash = hashPayload({
      descriptor,
      artifact: { artifactUri: body.artifactUri, entrypoint, files },
    });
    if (body.bundleHash && body.bundleHash !== computedBundleHash)
      throw error(
        400,
        'Provided bundle hash does not match the artifact manifest',
      );
    const bundleHash = computedBundleHash;
    const manifest = SkillArtifactManifestSchema.parse({
      artifactUri: body.artifactUri,
      entrypoint: normalizeArtifactPath(entrypoint),
      files,
      bundleHash,
    });
    const key = DealStore.skillKey(
      human.organizationId,
      descriptor.name,
      descriptor.version!,
    );
    if (store.skillRegistry.has(key))
      throw error(409, 'That skill version is already registered');
    const now = new Date().toISOString();
    const entry = SkillRegistryEntrySchema.parse({
      id: crypto.randomUUID(),
      organizationId: human.organizationId,
      name: descriptor.name,
      version: descriptor.version,
      descriptor,
      manifest,
      reviewStatus: body.reviewStatus,
      createdBy: human.id,
      createdAt: now,
      updatedAt: now,
    });
    store.skillRegistry.set(key, entry);
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'skill.registered',
      payload: {
        registryId: entry.id,
        name: entry.name,
        version: entry.version,
        reviewStatus: entry.reviewStatus,
        bundleHash: entry.manifest.bundleHash,
      },
    });
    return entry;
  });

  app.post('/v1/skills/:skillId/submit', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const human = store.humans.get(credential.humanId);
    const params = request.params as { skillId: string };
    const entry = [...store.skillRegistry.values()].find(
      (item) => item.id === params.skillId,
    );
    if (!human || !entry || entry.organizationId !== human.organizationId)
      throw error(404, 'Skill not found');
    if (!['draft', 'rejected'].includes(entry.reviewStatus))
      throw error(409, 'Only draft or rejected skills can be submitted');
    entry.reviewStatus = 'pending_review';
    entry.updatedAt = new Date().toISOString();
    entry.reviewedBy = undefined;
    entry.reviewedAt = undefined;
    entry.reviewNote = undefined;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'skill.submitted',
      payload: {
        registryId: entry.id,
        name: entry.name,
        version: entry.version,
      },
    });
    return entry;
  });

  app.post('/v1/skills/:skillId/review', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(
      z.object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().max(4000).optional(),
      }),
      request.body,
    );
    const human = store.humans.get(credential.humanId);
    const params = request.params as { skillId: string };
    const entry = [...store.skillRegistry.values()].find(
      (item) => item.id === params.skillId,
    );
    if (!human || !entry || entry.organizationId !== human.organizationId)
      throw error(404, 'Skill not found');
    if (entry.reviewStatus !== 'pending_review')
      throw error(409, 'Only pending skills can be reviewed');
    if (body.decision === 'approved') {
      if (!skillSigner.configured)
        throw error(503, 'Skill signing keys are not configured');
      entry.signature = await skillSigner.sign(signingPayloadForSkill(entry));
      entry.signingKeyId = skillSigner.keyId;
      entry.signingPublicKey = skillSigner.publicKeyPem;
      entry.signedAt = new Date().toISOString();
      entry.reviewStatus = 'approved';
    } else {
      entry.reviewStatus = 'rejected';
      entry.signature = undefined;
      entry.signingKeyId = undefined;
      entry.signingPublicKey = undefined;
      entry.signedAt = undefined;
    }
    entry.reviewedBy = human.id;
    entry.reviewedAt = new Date().toISOString();
    entry.reviewNote = body.note;
    entry.updatedAt = entry.reviewedAt;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: `skill.${body.decision}`,
      payload: {
        registryId: entry.id,
        name: entry.name,
        version: entry.version,
        signingKeyId: entry.signingKeyId,
      },
    });
    return entry;
  });

  app.post('/v1/skills/:skillId/revoke', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(
      z.object({ reason: z.string().min(1).max(4000) }),
      request.body,
    );
    const human = store.humans.get(credential.humanId);
    const params = request.params as { skillId: string };
    const entry = [...store.skillRegistry.values()].find(
      (item) => item.id === params.skillId,
    );
    if (!human || !entry || entry.organizationId !== human.organizationId)
      throw error(404, 'Skill not found');
    if (entry.reviewStatus !== 'approved')
      throw error(409, 'Only approved skills can be revoked');
    entry.reviewStatus = 'revoked';
    entry.revokedBy = human.id;
    entry.revokedAt = new Date().toISOString();
    entry.revocationReason = body.reason;
    entry.updatedAt = entry.revokedAt;
    store.recordAudit({
      humanId: human.id,
      organizationId: human.organizationId,
      eventType: 'skill.revoked',
      payload: {
        registryId: entry.id,
        name: entry.name,
        version: entry.version,
        reason: body.reason,
      },
    });
    return entry;
  });

  app.patch('/v1/profile', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
        judgment: JudgmentRulesSchema.partial().optional(),
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
    if (body.judgment)
      human.judgment = JudgmentRulesSchema.parse({
        ...human.judgment,
        ...body.judgment,
      });
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    const body = parse(
      z.object({
        displayName: z.string().min(1).optional(),
        role: z.string().optional(),
        focus: z.string().optional(),
        referralSource: z.string().optional(),
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
    human.onboarding = {
      ...human.onboarding,
      role: body.role ?? human.onboarding?.role ?? human.role,
      focus: body.focus ?? human.onboarding?.focus,
      referralSource: body.referralSource ?? human.onboarding?.referralSource,
      completedAt: new Date().toISOString(),
    };
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
      payload: {
        fields: Object.keys(body),
        role: human.onboarding.role,
        focus: human.onboarding.focus,
        referralSource: human.onboarding.referralSource,
      },
    });
    return human;
  });

  app.post('/v1/conversations', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    return [...store.conversations.values()]
      .filter((conversation) => conversation.humanId === credential.humanId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  app.get('/v1/conversations/:conversationId/turns', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    return [...store.feedback.values()]
      .filter(
        (item) =>
          item.humanId === credential.humanId &&
          (credential.kind === 'human' || item.agentId === credential.agentId),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  app.post('/v1/workflows', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    return [...store.workflows.values()]
      .filter((workflow) => workflow.humanId === credential.humanId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  app.get('/v1/workflows/:workflowId', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    const params = request.params as { workflowId: string };
    const workflow = store.workflows.get(params.workflowId);
    if (!workflow || workflow.humanId !== credential.humanId)
      throw error(404, 'Workflow not found');
    if (credential.kind === 'agent' && workflow.agentId !== credential.agentId)
      throw error(403, 'Workflow is not assigned to this agent');
    return workflow;
  });

  app.post('/v1/workflows/:workflowId/transition', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
    return [...store.approvals.values()]
      .filter((approval) => approval.humanId === credential.humanId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  app.post('/v1/delegations/:delegationId/revoke', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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

    const resolvedSkillResults = await Promise.all(
      (body.skills ?? []).map(async (skill) => {
        if (skill.source !== 'organization')
          return {
            descriptor: SkillDescriptorSchema.parse(skill),
            attestation: undefined,
          };
        if (!skill.version || !skill.contentHash)
          throw error(
            400,
            `Organization skill '${skill.name}' must pin an exact version and content hash`,
          );
        const registered = store.findSkill(
          human.organizationId,
          skill.name,
          skill.version,
        );
        if (
          !registered ||
          registered.reviewStatus !== 'approved' ||
          Boolean(registered.revokedAt)
        )
          throw error(
            409,
            `Organization skill '${skill.name}@${skill.version}' is not approved or has been revoked`,
          );
        if (registered.descriptor.contentHash !== skill.contentHash)
          throw error(
            409,
            `Organization skill '${skill.name}@${skill.version}' content hash does not match the registry`,
          );
        const attestation = skillAttestation(registered);
        if (
          !registered.signingPublicKey ||
          !(await skillSigner.verify(
            attestation.signature,
            signingPayloadForSkill(registered),
            {
              publicKeyPem: registered.signingPublicKey,
              keyId: attestation.signingKeyId,
            },
          ))
        )
          throw error(
            503,
            'Organization skill attestation could not be verified',
          );
        return { descriptor: registered.descriptor, attestation };
      }),
    );
    const attestedSkills = resolvedSkillResults.flatMap((result) =>
      result.attestation ? [result.attestation] : [],
    );
    const resolvedSkills = resolvedSkillResults.map(
      (result) => result.descriptor,
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
    const cognition = routeTaskCognition({
      task: body.task,
      humanRole: human.role,
      declaredProfession: domain.profession ?? delegation.profileId,
      domain: [domain.industry, domain.specialization, ...domain.goals].filter(
        (value): value is string => Boolean(value),
      ),
    });
    const selectedProfessionId =
      delegation.profileId ?? domain.profession ?? 'generalist_assistant_v1';
    const selectedProfession =
      getProfessionProfile(selectedProfessionId) ??
      getProfessionProfile('generalist_assistant_v1');
    const professionalContext = selectedProfession
      ? {
          profileId: selectedProfession?.id ?? selectedProfessionId,
          profileVersion: selectedProfession.version,
          title: selectedProfession.title,
          subjectType: selectedProfession.subjectType,
          category: selectedProfession.category,
          role: human.role || selectedProfession.title,
          industry: domain.industry,
          specialization: domain.specialization,
          seniority: domain.seniority,
          jurisdictions: domain.jurisdictions,
          objective: selectedProfession.objective,
          responsibilities: selectedProfession.responsibilities,
          knowledgeAreas: selectedProfession.knowledgeAreas,
          operatingPatterns: selectedProfession.operatingPatterns,
          communicationPatterns: selectedProfession.communicationPatterns,
          decisionPatterns: selectedProfession.decisionPatterns,
          failureModes: selectedProfession.failureModes,
          escalationTriggers: selectedProfession.escalationTriggers,
          safetyBoundaries: selectedProfession.safetyBoundaries,
          sensitiveDataClasses: selectedProfession.sensitiveDataClasses,
          regulated: selectedProfession.regulated,
          licenseRequiredFor: selectedProfession.licenseRequiredFor,
          restrictedActions: selectedProfession.restrictedActions,
          approvalActions: selectedProfession.approvalActions,
          contextAccess: 'automatic' as const,
          requiredContext: selectedProfession.requiredContext,
          missingContext: missingProfessionalContext(
            selectedProfession.requiredContext,
            {
              ...domain,
              role: human.role,
              communicationStyle: persona.communicationStyle,
              goal: body.task,
              constraints: human.knownConstraints,
            },
          ),
          humanFacts: visibleFacts(
            biography.domainExpertise,
            includeSensitiveContext,
          ),
          source: selectedProfession.source,
        }
      : undefined;

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
      professional: professionalContext,
      cognition,
      humanModel: scopedHumanModel.model,
      interaction,
      grounding,
      redactions: scopedHumanModel.redactions,
      policyVersion: delegation.profileId ?? 'default_v1',
      ttlMinutes: contextTtlMinutes,
      memoryReferences: memory.references,
      skills: resolvedSkills,
      skillAttestations: attestedSkills,
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
        skills: packet.skills.active.map((skill) => ({
          name: skill.name,
          version: skill.version,
          contentHash: skill.contentHash,
          source: skill.source,
        })),
        skillAttestations: packet.skills.attestations.map((attestation) => ({
          registryId: attestation.registryId,
          name: attestation.name,
          version: attestation.version,
          signingKeyId: attestation.signingKeyId,
        })),
      },
    });
    return { packetId: packet.packetId, packet, signature };
  });

  app.get('/v1/context/:packetId', async (request) => {
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const result = evaluatePolicy(delegation.authority, human.judgment, body, [
      ...professionalPolicyRules(context.packet.professional ?? {}),
      ...delegation.policyRules,
    ]);
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
      [
        ...professionalPolicyRules(context.packet.professional ?? {}),
        ...delegation.policyRules,
      ],
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'agent',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
    const credential = await requireCredential(
      store,
      request,
      'human',
      options.externalAuth,
    );
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
      for (const memory of await store.memories.list(
        credential.humanId,
        store.humans.get(credential.humanId)?.organizationId,
      )) {
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
    const credential = await requireCredential(
      store,
      request,
      undefined,
      options.externalAuth,
    );
    return store.audits.filter((event) => event.humanId === credential.humanId);
  });

  app.setErrorHandler((cause, request, reply) => {
    const caught = cause as Error & { statusCode?: number };
    request.log.error({ err: cause }, 'request failed');
    const statusCode = caught.statusCode ?? 500;
    metrics.increment('deal_http_errors_total', { status: String(statusCode) });
    if (statusCode === 401) metrics.increment('deal_auth_failures_total');
    reply.header('X-Request-ID', request.id);
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : caught.message,
      requestId: request.id,
    });
  });
  return app;
}
