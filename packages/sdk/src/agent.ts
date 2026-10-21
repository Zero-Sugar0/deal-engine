import { HumanContextPacketSchema } from '@deal/core';
import type { HumanContextPacket } from '@deal/core';
import { deal } from './index.js';
import type { ContextRequest, DealOptions } from './index.js';

export type ContextEnvelope = {
  packetId: string;
  packet: HumanContextPacket;
  signature: string;
  contextRevision?: string;
};

export interface DealClientPort {
  getContext(input: ContextRequest): Promise<ContextEnvelope>;
  getContextRevision?(): Promise<{ revision: string; modelVersion: number }>;
  reportOutcome(input: {
    contextPacketId: string;
    outcome: Record<string, unknown>;
  }): Promise<{ id: string }>;
  giveContextFeedback(input: {
    contextPacketId: string;
    rating: 'helpful' | 'mixed' | 'unhelpful';
    correction?: string;
    whatWorked?: string;
    whatToChange?: string;
  }): Promise<{ feedback: Record<string, unknown>; memoryId?: string }>;
}

export type DealContextRenderer = (packet: HumanContextPacket) => string;

export type PreparedDealContext = ContextEnvelope & {
  systemInstruction: string;
};

export interface DealAgentRuntimeOptions {
  render?: DealContextRenderer;
  cache?: boolean;
  now?: () => Date;
}

export type DealChatInput = Omit<ContextRequest, 'task'> & {
  messages: readonly unknown[];
  task?: string;
};

function stableValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
    .join(',')}}`;
}

const relevanceStopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'because',
  'been',
  'being',
  'before',
  'between',
  'but',
  'can',
  'could',
  'did',
  'does',
  'doing',
  'down',
  'for',
  'from',
  'had',
  'has',
  'have',
  'here',
  'how',
  'into',
  'its',
  'just',
  'like',
  'more',
  'most',
  'not',
  'now',
  'only',
  'other',
  'our',
  'out',
  'please',
  'should',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'too',
  'under',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
  'its',
  'it',
  'i',
  'me',
  'my',
  'we',
  'us',
  'a',
  'an',
  'as',
  'at',
  'by',
  'do',
  'if',
  'in',
  'is',
  'of',
  'on',
  'or',
  'to',
]);

function contextWords(value: unknown): Set<string> {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !relevanceStopWords.has(word)),
  );
}

function overlapsTask(taskWords: Set<string>, value: unknown): boolean {
  const words = contextWords(value);
  if (!taskWords.size || !words.size) return false;
  let matches = 0;
  for (const word of words) if (taskWords.has(word)) matches += 1;
  return matches >= (taskWords.size > 8 ? 2 : 1);
}

function definedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === '') return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === 'object') return Object.keys(item).length > 0;
      return true;
    }),
  ) as T;
}

function selectedProfileFacts(
  facts: readonly unknown[],
  taskWords: Set<string>,
  alwaysRelevant = false,
  limit = 5,
): unknown[] {
  return facts
    .filter((fact) => {
      if (!fact || typeof fact !== 'object') return false;
      const record = fact as Record<string, unknown>;
      if (record.confirmation === 'inferred') return false;
      if (
        typeof record.validUntil === 'string' &&
        Date.parse(record.validUntil) <= Date.now()
      )
        return false;
      return alwaysRelevant || overlapsTask(taskWords, record.value ?? record);
    })
    .slice(0, limit)
    .map((fact) => {
      const record = fact as Record<string, unknown>;
      return definedValues({
        value: record.value,
        category: record.category,
        source: record.source,
        confirmation: record.confirmation,
      });
    });
}

function contextData(packet: HumanContextPacket): Record<string, unknown> {
  const model = packet.humanModel;
  const identity = model.identity;
  const persona = {
    ...packet.persona,
    ...Object.fromEntries(
      Object.entries(model.persona).filter(([, value]) => {
        if (value === undefined || value === null || value === '') return false;
        return !Array.isArray(value) || value.length > 0;
      }),
    ),
  } as HumanContextPacket['persona'];
  const route = packet.cognition;
  const exclusions = new Set(
    packet.composition.excluded.map((item) => item.id),
  );
  const personalContextEnabled = packet.composition.applied.personalContext;
  const identityEnabled =
    personalContextEnabled &&
    !exclusions.has('human_identity') &&
    !exclusions.has('identity');
  const personaEnabled =
    personalContextEnabled &&
    !exclusions.has('human_persona') &&
    !exclusions.has('persona');
  const memoryEnabled =
    personalContextEnabled &&
    !exclusions.has('human_memory') &&
    !exclusions.has('memory');
  const taskWords = contextWords(packet.task);
  const taskAndDomainWords = contextWords(
    [packet.task, route?.title, ...(route?.knowledgeAreas ?? [])]
      .filter(Boolean)
      .join(' '),
  );
  const task = packet.task.toLowerCase();
  const selectedIdentity = new Set(
    identityEnabled ? packet.composition.applied.identityFields : [],
  );
  const reflective =
    route?.subjectType === 'human_thought' ||
    route?.subjectType === 'human_understanding' ||
    /\b(life|meaning|purpose|values|what matters|who am i|my story|my background|about me)\b/.test(
      task,
    );
  const decisionFocused =
    route?.subjectType === 'business' ||
    route?.subjectType === 'consumer' ||
    route?.subjectType === 'human_thought' ||
    /\b(should i|decision|choose|choice|options|trade.?off|recommend|weigh)\b/.test(
      task,
    );
  const relationshipFocused =
    route?.subjectType === 'human_relationship' ||
    Boolean(packet.composition.applied.relationshipId);
  const selfDescriptionRequested =
    /\b(about me|who am i|my identity|my background|my story|my bio|biography|introduce me)\b/.test(
      task,
    );

  const user = identityEnabled
    ? definedValues({
        preferredName: packet.principal.preferredName ?? identity.preferredName,
        locale: identity.locale === 'en' ? undefined : identity.locale,
        language: persona.language,
        languages: selectedIdentity.has('identity.languages')
          ? identity.languages.map((item) => item.value).slice(0, 4)
          : undefined,
        pronouns: selectedIdentity.has('identity.pronouns')
          ? identity.pronouns
          : undefined,
        country: selectedIdentity.has('identity.country')
          ? identity.country
          : undefined,
        age: selectedIdentity.has('identity.age') ? identity.age : undefined,
        mission: selfDescriptionRequested ? identity.mission : undefined,
        organization: selfDescriptionRequested
          ? identity.organization
          : undefined,
        selfDescription: selfDescriptionRequested
          ? identity.selfDescription
          : undefined,
        genderIdentity: selectedIdentity.has('identity.genderIdentity')
          ? identity.genderIdentity?.value
          : undefined,
        raceEthnicity: selectedIdentity.has('identity.raceEthnicity')
          ? identity.raceEthnicity.map((item) => item.value)
          : undefined,
        culturalBackground: selectedIdentity.has('identity.culturalBackground')
          ? identity.culturalBackground.map((item) => item.value)
          : undefined,
        nationality: selectedIdentity.has('identity.nationality')
          ? identity.nationality.map((item) => item.value)
          : undefined,
        personalBackground: selectedIdentity.has('identity.personalBackground')
          ? identity.personalBackground.map((item) => item.value)
          : undefined,
        religionOrBelief: selectedIdentity.has('identity.religionOrBelief')
          ? identity.religionOrBelief?.value
          : undefined,
        sexualOrientation: selectedIdentity.has('identity.sexualOrientation')
          ? identity.sexualOrientation?.value
          : undefined,
        accessibilityNeeds: selectedIdentity.has('identity.accessibilityNeeds')
          ? identity.accessibilityNeeds.map((item) => item.value)
          : undefined,
      })
    : {};

  const communication = personaEnabled
    ? definedValues({
        style: persona.communicationStyle,
        tone: persona.tone,
        directness: persona.directness,
        warmth: persona.warmth,
        verbosity: persona.verbosity,
        structure: persona.structure,
        humor: persona.humor,
        dialect: persona.dialect,
        sentenceRhythm: persona.sentenceRhythm,
        useContractions: persona.useContractions,
        punctuation: persona.punctuation,
        emojiPolicy: persona.emojiPolicy,
        responseLength: persona.responseLength,
        preferredPhrases: persona.preferredPhrases,
        avoidedPhrases: persona.avoidedPhrases,
        formatting: persona.formattingPreferences,
      })
    : {};

  const values = personalContextEnabled
    ? (definedValues(
        reflective || decisionFocused
          ? {
              hierarchy: model.selfConcept.valuesHierarchy.slice(0, 6),
              priorities: model.decision.priorities.slice(0, 6),
              tradeoffs: model.decision.tradeoffs.slice(0, 4),
              selfDescription:
                model.selfConcept.howTheyDescribeThemselves.slice(0, 5),
            }
          : {
              hierarchy: model.selfConcept.valuesHierarchy
                .filter((item) => overlapsTask(taskWords, item))
                .slice(0, 4),
              priorities: model.decision.priorities
                .filter((item) => overlapsTask(taskWords, item))
                .slice(0, 4),
              tradeoffs: model.decision.tradeoffs
                .filter((item) => overlapsTask(taskWords, item))
                .slice(0, 3),
              selfDescription: model.selfConcept.howTheyDescribeThemselves
                .filter((item) => overlapsTask(taskWords, item))
                .slice(0, 3),
            },
      ) as Record<string, unknown>)
    : {};

  const lifeContext = personalContextEnabled
    ? definedValues({
        selfConcept:
          reflective || selfDescriptionRequested
            ? model.selfConcept.summary
            : undefined,
        identityStatements: selectedProfileFacts(
          model.selfConcept.identityStatements,
          taskWords,
          reflective || selfDescriptionRequested,
          4,
        ),
        strengths: selectedProfileFacts(
          model.selfConcept.strengths,
          taskWords,
          selfDescriptionRequested,
          4,
        ),
        aspirations: selectedProfileFacts(
          model.selfConcept.aspirations,
          taskWords,
          reflective,
          4,
        ),
        nonNegotiables: selectedProfileFacts(
          model.selfConcept.nonNegotiables,
          taskWords,
          decisionFocused,
          4,
        ),
        values,
        biography:
          reflective || selfDescriptionRequested
            ? definedValues({
                summary: model.biography.summary,
                currentChapter: model.biography.currentChapter,
              })
            : undefined,
        domainExpertise: selectedProfileFacts(
          model.biography.domainExpertise,
          taskAndDomainWords,
          false,
          5,
        ),
        lifeContext: selectedProfileFacts(
          model.biography.lifeContext,
          taskWords,
          reflective,
          5,
        ),
        currentPriorities: model.currentPriorities
          .filter((item) => overlapsTask(taskWords, item) || decisionFocused)
          .slice(0, 5),
        constraints: model.knownConstraints
          .filter((item) => overlapsTask(taskWords, item) || decisionFocused)
          .slice(0, 5),
        domain:
          decisionFocused || route?.subjectType === 'business'
            ? definedValues({
                business: model.domain.business,
                industry: model.domain.industry,
                specialization: model.domain.specialization,
                goals: model.domain.goals,
              })
            : undefined,
        decisionStyle: decisionFocused
          ? definedValues({
              riskTolerance: model.decision.riskTolerance,
              reversibilityPreference: model.decision.reversibilityPreference,
              timeHorizon: model.decision.timeHorizon,
              defaultStance: model.decision.defaultStance,
              heuristics: model.decision.heuristics.slice(0, 4),
            })
          : undefined,
        relationships: relationshipFocused
          ? model.relationships
              .filter(
                (item) => item.id === packet.composition.applied.relationshipId,
              )
              .map((item) =>
                definedValues({
                  label: item.label,
                  role: item.role,
                  context: item.context,
                  goals: item.goals,
                  communicationPreferences: item.communicationPreferences,
                  boundaries: item.boundaries,
                }),
              )
          : undefined,
        relationalPreferences: relationshipFocused
          ? definedValues({
              acknowledgment: model.relational.acknowledgmentPreferences,
              encouragement: model.relational.encouragementPreferences,
              conflict: model.relational.conflictPreferences,
              repair: model.relational.repairProtocol,
            })
          : undefined,
      })
    : {};

  const matchingMemory = memoryEnabled
    ? packet.memory.items
        .filter(
          (item) =>
            item.confirmation !== 'inferred' &&
            overlapsTask(taskWords, item.content),
        )
        .slice(0, 6)
        .map((item) =>
          definedValues({
            type: item.kind,
            content: item.content,
            source: item.source,
            confirmation: item.confirmation,
          }),
        )
    : [];

  const selectedMode =
    personaEnabled &&
    persona.modes.find(
      (mode) => mode.id === packet.composition.applied.personaMode,
    );
  const audienceMode = selectedMode
    ? definedValues({
        audience: selectedMode.audience,
        purpose: selectedMode.purpose,
        tone: selectedMode.tone,
        verbosity: selectedMode.verbosity,
        structure: selectedMode.structure,
        preferredPhrases: selectedMode.preferredPhrases,
        avoidedPhrases: selectedMode.avoidedPhrases,
      })
    : undefined;

  const taskUnderstanding =
    route && route.profileId !== 'generalist_assistant_v1'
      ? definedValues({
          area: route.title,
          summary: route.summary,
          objective: route.objective,
          knowledge: route.knowledgeAreas.slice(0, 8),
          operatingPatterns: route.operatingPatterns
            .map((item) => ({ id: item.id, description: item.description }))
            .slice(0, 6),
          communicationPatterns: route.communicationPatterns
            .map((item) => ({ id: item.id, description: item.description }))
            .slice(0, 4),
          decisionPatterns: route.decisionPatterns
            .map((item) => ({ id: item.id, description: item.description }))
            .slice(0, 4),
          failureModes: route.failureModes.slice(0, 5),
          safetyBoundaries: route.safetyBoundaries.slice(0, 5),
        })
      : undefined;

  return definedValues({
    person: Object.keys(user).length ? user : undefined,
    communication: Object.keys(communication).length
      ? communication
      : undefined,
    audienceMode,
    relevantLifeContext: Object.keys(lifeContext).length
      ? lifeContext
      : undefined,
    relevantMemories: matchingMemory.length ? matchingMemory : undefined,
    taskUnderstanding,
    conversation: personalContextEnabled
      ? definedValues({
          summary:
            overlapsTask(taskWords, packet.interaction.summary) ||
            /\b(it|that|those|them|same|continue|earlier|above)\b/.test(task)
              ? packet.interaction.summary
              : undefined,
          activeTopic: overlapsTask(taskWords, packet.interaction.activeTopic)
            ? packet.interaction.activeTopic
            : undefined,
          openLoops: packet.interaction.openLoops
            .filter((item) => overlapsTask(taskWords, item))
            .slice(0, 5),
        })
      : undefined,
  });
}

/** Extract the latest human-authored message for automatic chat context. */
export function extractLatestUserText(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') continue;
    const role = (message as { role?: unknown }).role;
    if (role !== 'user' && role !== 'human') continue;
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part)
            return String((part as { text: unknown }).text);
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

/**
 * Selects the task-relevant human context in code and serializes it as data.
 * It intentionally contains no agent identity, delegation, permission, or
 * approval narration; those belong to the runtime, not ordinary conversation.
 */
export function renderDealContext(packet: HumanContextPacket): string {
  const selected = contextData(packet);
  if (!Object.keys(selected).length) return '';
  return `<human_context_data>\n${JSON.stringify(selected)}\n</human_context_data>`;
}

export class DealAgentRuntime {
  private readonly render: DealContextRenderer;
  private readonly cacheEnabled: boolean;
  private readonly now: () => Date;
  private readonly cache = new Map<
    string,
    { prepared: PreparedDealContext; expiresAt: number }
  >();

  constructor(
    private readonly client: DealClientPort | deal,
    options: DealAgentRuntimeOptions = {},
  ) {
    this.render = options.render ?? renderDealContext;
    this.cacheEnabled = options.cache ?? true;
    this.now = options.now ?? (() => new Date());
  }

  async prepare(
    input: ContextRequest,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PreparedDealContext> {
    const key = stableValue(input);
    const revision = this.client.getContextRevision
      ? (await this.client.getContextRevision()).revision
      : undefined;
    const revisionKey = revision ? `${revision}:${key}` : key;
    const cached =
      this.cacheEnabled && !options.forceRefresh
        ? this.cache.get(revisionKey)
        : undefined;
    const now = this.now().getTime();
    if (cached && cached.expiresAt > now) return cached.prepared;

    const envelope = await this.client.getContext(input);
    const packet = HumanContextPacketSchema.parse(envelope.packet);
    const prepared = {
      ...envelope,
      packet,
      systemInstruction: this.render(packet),
    };
    if (this.cacheEnabled) {
      this.cache.set(revisionKey, {
        prepared,
        expiresAt: new Date(packet.expiresAt).getTime(),
      });
    }
    return prepared;
  }

  /**
   * Prepare context directly from a provider chat message list. This is the
   * low-friction path for integrations: the latest user turn becomes the
   * scoped task and conversation metadata is sent to DEAL automatically.
   */
  async prepareChat(
    input: DealChatInput,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PreparedDealContext> {
    const { messages, task, ...context } = input;
    const resolvedTask = task?.trim() || extractLatestUserText(messages);
    if (!resolvedTask)
      throw new Error(
        'DEAL chat context requires a task or at least one user message',
      );
    return this.prepare({ ...context, task: resolvedTask }, options);
  }

  async reportOutcome(input: {
    contextPacketId: string;
    outcome: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.client.reportOutcome(input);
  }

  async giveFeedback(input: {
    contextPacketId: string;
    rating: 'helpful' | 'mixed' | 'unhelpful';
    correction?: string;
    whatWorked?: string;
    whatToChange?: string;
  }): Promise<{ feedback: Record<string, unknown>; memoryId?: string }> {
    return this.client.giveContextFeedback(input);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export function createDealAgentRuntime(
  client: DealClientPort | deal | string | DealOptions,
  options?: DealAgentRuntimeOptions,
): DealAgentRuntime {
  if (typeof client === 'string')
    return new DealAgentRuntime(new deal(client), options);
  if ('getContext' in client) return new DealAgentRuntime(client, options);
  return new DealAgentRuntime(new deal(client), options);
}
