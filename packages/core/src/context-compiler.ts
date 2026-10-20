import { createHash } from 'node:crypto';
import {
  BehavioralContractSchema,
  GroundingSchema,
  HumanModelSchema,
  InteractionContextSchema,
  ResponseGuidanceSchema,
  ProfessionalContextSchema,
} from './schema.js';
import type {
  Authority,
  DomainContext,
  HumanContextPacket,
  HumanModel,
  InteractionContext,
  Grounding,
  JudgmentRules,
  MemoryContext,
  MemoryReference,
  Persona,
  ProfessionalContext,
  ResponseGuidance,
} from './schema.js';

export interface CompileContextInput {
  human: {
    id: string;
    organizationId?: string;
    displayName?: string;
    role?: string;
    preferredName?: string;
    pronouns?: string;
    mission?: string;
    locale?: string;
    timezone?: string;
  };
  agent: { id: string; runtime: string; delegationId: string };
  task: string;
  persona: Persona;
  domain: DomainContext;
  memory: MemoryContext;
  authority: Authority;
  judgment: JudgmentRules;
  policyVersion?: string;
  ttlMinutes?: number;
  memoryReferences?: MemoryReference[];
  redactions?: string[];
  humanModel?: HumanModel;
  interaction?: InteractionContext;
  grounding?: Grounding;
  professional?: ProfessionalContext;
}

export function hashTask(task: string): string {
  return createHash('sha256').update(task.trim()).digest('hex');
}

export function compileHumanContextPacket(
  input: CompileContextInput,
): HumanContextPacket {
  const issuedAt = new Date();
  const ttlMinutes = Math.max(1, input.ttlMinutes ?? 15);
  const expiresAt = new Date(issuedAt.getTime() + ttlMinutes * 60_000);
  const humanModel: HumanModel = input.humanModel ?? {
    version: 1,
    identity: {
      preferredName: input.human.preferredName,
      pronouns: input.human.pronouns,
      mission: input.human.mission,
      locale: input.human.locale ?? 'en',
      timezone: input.human.timezone,
      languages: [],
      identityMarkers: [],
      affiliations: [],
      accessibilityNeeds: [],
    },
    persona: {
      ...input.persona,
      formattingPreferences: [],
      examples: [],
      modes: [],
    },
    selfConcept: {
      identityStatements: [],
      strengths: [],
      growthEdges: [],
      aspirations: [],
      fears: [],
      nonNegotiables: [],
      valuesHierarchy: [],
      howTheyDescribeThemselves: [],
    },
    biography: {
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
      trustBreakers: [],
      calmingFactors: [],
      frustrationTriggers: [],
      sensitiveTopics: [],
      acknowledgmentPreferences: [],
      encouragementPreferences: [],
      conflictPreferences: [],
      repairProtocol: [],
      emotionalContextNotes: [],
    },
    boundaries: {
      neverAssume: [],
      mustAsk: [],
      neverMention: [],
      neverInfer: [],
      sensitiveTopics: [],
      consentRules: [],
      protectedAttributes: [],
      privacyPreferences: [],
    },
    domain: input.domain,
    decision: {
      priorities: input.domain.goals ?? [],
      tradeoffs: [],
      asksBeforeCommitment: [],
      riskTolerance: input.persona.riskTolerance,
      northStars: [],
      decisionProcess: [],
      autonomyPreferences: [],
      escalationTriggers: [],
      redLines: [],
      heuristics: [],
      examples: [],
    },
    behavior: BehavioralContractSchema.parse({
      responsePrinciples: [
        'preserve explicit human preferences',
        'state uncertainty instead of manufacturing confidence',
        'ask before crossing a stated boundary',
      ],
      refusalStyle: 'explain_boundary',
      preserveHumanVoice: true,
      neverImpersonate: true,
    }),
    responseGuidance: {
      style: [],
      prioritize: [],
      avoid: [],
      whenUncertain: 'ask',
      whenDisagreeing: 'challenge_respectfully',
      whenWrong: 'admit_and_correct',
      identityDisclosure:
        'Be truthful that you are an AI agent acting with delegated context.',
      identitySummary: [],
      relationshipGuidance: [],
      emotionalGuidance: [],
      decisionGuidance: [],
      refusalStyle: 'explain_boundary',
      preserveHumanVoice: true,
    },
    currentPriorities: input.domain.goals ?? [],
    knownConstraints: input.domain.exclusions ?? [],
  };
  const normalizedHumanModel = HumanModelSchema.parse(humanModel);
  const normalizedInteraction = InteractionContextSchema.parse(
    input.interaction ?? {},
  );
  const audienceTarget = (
    normalizedInteraction.audience ??
    normalizedInteraction.channel ??
    ''
  ).toLowerCase();
  const audienceMode = normalizedHumanModel.persona.modes.find((mode) => {
    const audience = mode.audience.toLowerCase();
    return audienceTarget === audience || audienceTarget.includes(audience);
  });
  const relationshipContext = normalizedHumanModel.relationships.find(
    (relationship) => {
      const candidates = [
        relationship.audience,
        relationship.label,
        ...relationship.aliases,
      ]
        .filter(Boolean)
        .map((item) => item!.toLowerCase());
      return candidates.some(
        (candidate) =>
          audienceTarget === candidate || audienceTarget.includes(candidate),
      );
    },
  );
  const directness =
    audienceMode?.directness ?? normalizedHumanModel.persona.directness;
  const warmth = audienceMode?.warmth ?? normalizedHumanModel.persona.warmth;
  const verbosity =
    audienceMode?.verbosity ?? normalizedHumanModel.persona.verbosity;
  const structure =
    audienceMode?.structure ?? normalizedHumanModel.persona.structure;
  const identitySummary = [
    normalizedHumanModel.identity.selfDescription,
    normalizedHumanModel.selfConcept.summary,
    normalizedHumanModel.biography.currentChapter
      ? `Current chapter: ${normalizedHumanModel.biography.currentChapter}`
      : undefined,
    ...normalizedHumanModel.selfConcept.howTheyDescribeThemselves,
    ...normalizedHumanModel.selfConcept.valuesHierarchy
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 5)
      .map((item) => `Value: ${item.value}`),
  ].filter((item): item is string => Boolean(item));
  const responseGuidance: ResponseGuidance = ResponseGuidanceSchema.parse({
    style: [
      (audienceMode?.tone ?? normalizedHumanModel.persona.tone)
        ? `Use a ${audienceMode?.tone ?? normalizedHumanModel.persona.tone} tone`
        : undefined,
      directness !== undefined
        ? directness >= 0.7
          ? 'Lead with the point and avoid unnecessary hedging'
          : 'Use context and nuance before reaching the point'
        : undefined,
      warmth !== undefined
        ? warmth >= 0.7
          ? 'Make the response warm and relational'
          : 'Keep warmth measured and professional'
        : undefined,
      verbosity ? `Prefer ${verbosity} responses` : undefined,
      structure ? `Use ${structure} structure` : undefined,
      normalizedHumanModel.persona.communicationStyle,
      normalizedHumanModel.persona.sentenceRhythm
        ? `Use ${normalizedHumanModel.persona.sentenceRhythm} sentence rhythm`
        : undefined,
      normalizedHumanModel.persona.greetingStyle
        ? `Use a ${normalizedHumanModel.persona.greetingStyle} greeting style`
        : undefined,
      normalizedHumanModel.persona.signoffStyle
        ? `Use a ${normalizedHumanModel.persona.signoffStyle} sign-off style`
        : undefined,
      normalizedHumanModel.persona.useContractions !== undefined
        ? normalizedHumanModel.persona.useContractions
          ? 'Use natural contractions where they sound like the human'
          : 'Avoid contractions'
        : undefined,
      normalizedHumanModel.persona.emojiPolicy
        ? `Emoji policy: ${normalizedHumanModel.persona.emojiPolicy}`
        : undefined,
      normalizedHumanModel.persona.leadWith
        ? `Lead with ${normalizedHumanModel.persona.leadWith}`
        : undefined,
      normalizedHumanModel.persona.explainWith
        ? `Explain with ${normalizedHumanModel.persona.explainWith}`
        : undefined,
      normalizedHumanModel.persona.askStyle
        ? `Ask questions in a ${normalizedHumanModel.persona.askStyle} way`
        : undefined,
      ...normalizedHumanModel.persona.formattingPreferences,
      ...(audienceMode?.formattingPreferences ?? []),
    ].filter((item): item is string => Boolean(item)),
    prioritize: [
      ...normalizedHumanModel.behavior.responsePrinciples,
      ...normalizedHumanModel.selfConcept.nonNegotiables.map(
        (fact) => `Preserve non-negotiable: ${fact.value}`,
      ),
      ...normalizedHumanModel.decision.northStars.map(
        (northStar) => `Use north star: ${northStar}`,
      ),
      ...normalizedHumanModel.persona.preferredPhrases.map(
        (phrase) => `Use preferred phrase: ${phrase}`,
      ),
      ...(audienceMode?.preferredPhrases ?? []).map(
        (phrase) => `Use audience-specific phrase: ${phrase}`,
      ),
    ],
    avoid: [
      ...normalizedHumanModel.persona.avoidedPhrases.map(
        (phrase) => `Avoid phrase: ${phrase}`,
      ),
      ...normalizedHumanModel.behavior.neverClaim.map(
        (claim) => `Never claim: ${claim}`,
      ),
      ...normalizedHumanModel.behavior.neverDo.map(
        (action) => `Never do: ${action}`,
      ),
      ...normalizedHumanModel.boundaries.neverAssume.map(
        (item) => `Never assume: ${item}`,
      ),
      ...normalizedHumanModel.boundaries.neverMention.map(
        (item) => `Never mention: ${item}`,
      ),
      ...normalizedHumanModel.boundaries.neverInfer.map(
        (item) => `Never infer: ${item}`,
      ),
      ...normalizedHumanModel.decision.redLines.map(
        (item) => `Decision red line: ${item}`,
      ),
      ...normalizedHumanModel.relational.trustBreakers.map(
        (fact) => `Protect trust by avoiding: ${fact.value}`,
      ),
      ...(audienceMode?.avoidedPhrases ?? []).map(
        (phrase) => `Avoid audience-specific phrase: ${phrase}`,
      ),
      ...(relationshipContext?.boundaries ?? []).map(
        (boundary) => `Relationship boundary: ${boundary}`,
      ),
    ],
    whenUncertain: normalizedHumanModel.behavior.whenUncertain,
    whenDisagreeing: normalizedHumanModel.behavior.whenDisagreeing,
    whenWrong: normalizedHumanModel.behavior.whenWrong,
    identityDisclosure: normalizedHumanModel.behavior.discloseAgentIdentity
      ? 'Be truthful that you are an AI agent acting with delegated context.'
      : 'Do not volunteer agent identity unless asked, but never impersonate a human or make false claims.',
    structure,
    identitySummary,
    relationshipGuidance: [
      ...(relationshipContext
        ? [
            `Relationship context: ${relationshipContext.label}`,
            relationshipContext.role
              ? `Relationship role: ${relationshipContext.role}`
              : undefined,
            relationshipContext.trustLevel
              ? `Trust level: ${relationshipContext.trustLevel}`
              : undefined,
          ].filter((item): item is string => Boolean(item))
        : []),
      ...(relationshipContext?.goals ?? []).map(
        (item) => `Relationship goal: ${item}`,
      ),
      ...(relationshipContext?.communicationPreferences ?? []).map(
        (item) => `Relationship communication preference: ${item}`,
      ),
      ...normalizedHumanModel.relational.trustSignals.map(
        (fact) => `Build trust through: ${fact.value}`,
      ),
      ...normalizedHumanModel.relational.acknowledgmentPreferences.map(
        (item) => `Acknowledge in this way: ${item}`,
      ),
      ...normalizedHumanModel.relational.conflictPreferences.map(
        (item) => `Handle conflict by: ${item}`,
      ),
      ...normalizedHumanModel.relational.repairProtocol.map(
        (item) => `If trust is damaged: ${item}`,
      ),
    ],
    emotionalGuidance: [
      ...normalizedHumanModel.relational.calmingFactors.map(
        (fact) => `When tension is high, use: ${fact.value}`,
      ),
      ...normalizedHumanModel.relational.frustrationTriggers.map(
        (fact) => `Avoid triggering frustration with: ${fact.value}`,
      ),
      ...normalizedHumanModel.relational.sensitiveTopics.map(
        (fact) => `Treat as sensitive: ${fact.value}`,
      ),
    ],
    decisionGuidance: [
      ...normalizedHumanModel.decision.tradeoffs,
      ...normalizedHumanModel.decision.heuristics,
      ...normalizedHumanModel.decision.decisionProcess,
      ...normalizedHumanModel.decision.escalationTriggers.map(
        (item) => `Escalate when: ${item}`,
      ),
    ],
    audienceMode: audienceMode?.id,
    relationshipId: relationshipContext?.id,
    refusalStyle: normalizedHumanModel.behavior.refusalStyle,
    preserveHumanVoice: normalizedHumanModel.behavior.preserveHumanVoice,
  });
  const finalHumanModel = HumanModelSchema.parse({
    ...normalizedHumanModel,
    responseGuidance,
  });

  return {
    schemaVersion: '4',
    packetId: crypto.randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    task: input.task,
    taskHash: hashTask(input.task),
    principal: {
      humanId: input.human.id,
      organizationId: input.human.organizationId,
      displayName: input.human.displayName,
      role: input.human.role,
      preferredName: input.human.preferredName,
      pronouns: input.human.pronouns,
      mission: input.human.mission,
      locale: input.human.locale,
      timezone: input.human.timezone,
      selfDescription: finalHumanModel.identity.selfDescription,
    },
    agent: {
      agentId: input.agent.id,
      runtime: input.agent.runtime,
      delegationId: input.agent.delegationId,
    },
    persona: finalHumanModel.persona,
    domain: finalHumanModel.domain,
    professional: ProfessionalContextSchema.parse(input.professional ?? {}),
    memory: {
      preferences: input.memory.preferences ?? [],
      corrections: input.memory.corrections ?? [],
      episodes: input.memory.episodes ?? [],
      outcomes: input.memory.outcomes ?? [],
      references: input.memoryReferences ?? input.memory.references ?? [],
      items: input.memory.items ?? [],
    },
    authority: input.authority,
    judgment: input.judgment,
    policyVersion: input.policyVersion ?? 'default_v1',
    redactions: input.redactions ?? [],
    humanModel: finalHumanModel,
    behavior: finalHumanModel.behavior,
    responseGuidance,
    interaction: normalizedInteraction,
    grounding: GroundingSchema.parse(input.grounding ?? {}),
  };
}
