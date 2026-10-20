import { z } from 'zod';

export const PolicyDecisionSchema = z.enum([
  'allow',
  'allow_with_redaction',
  'require_approval',
  'escalate',
  'deny',
]);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ProfileFactSchema = z.object({
  id: z.string().optional(),
  value: z.string(),
  category: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  confirmation: z
    .enum(['user_confirmed', 'agent_observed', 'inferred'])
    .default('user_confirmed'),
  source: z.string().optional(),
  capturedAt: z.string().datetime().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  sensitivity: z.enum(['normal', 'personal', 'sensitive']).default('normal'),
  tags: z.array(z.string()).default([]),
});
export type ProfileFact = z.infer<typeof ProfileFactSchema>;

export const ValuePrioritySchema = z.object({
  value: z.string(),
  meaning: z.string().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  tradeoff: z.string().optional(),
  fact: ProfileFactSchema.partial().optional(),
});
export type ValuePriority = z.infer<typeof ValuePrioritySchema>;

export const BiographyChapterSchema = z.object({
  title: z.string(),
  summary: z.string(),
  period: z.string().optional(),
  lessons: z.array(z.string()).default([]),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  confirmation: z
    .enum(['user_confirmed', 'agent_observed', 'inferred'])
    .default('user_confirmed'),
});
export type BiographyChapter = z.infer<typeof BiographyChapterSchema>;

export const SelfConceptSchema = z.object({
  summary: z.string().optional(),
  identityStatements: z.array(ProfileFactSchema).default([]),
  strengths: z.array(ProfileFactSchema).default([]),
  growthEdges: z.array(ProfileFactSchema).default([]),
  aspirations: z.array(ProfileFactSchema).default([]),
  fears: z.array(ProfileFactSchema).default([]),
  nonNegotiables: z.array(ProfileFactSchema).default([]),
  valuesHierarchy: z.array(ValuePrioritySchema).default([]),
  howTheyDescribeThemselves: z.array(z.string()).default([]),
});
export type SelfConcept = z.infer<typeof SelfConceptSchema>;

export const BiographySchema = z.object({
  summary: z.string().optional(),
  currentChapter: z.string().optional(),
  formativeExperiences: z.array(ProfileFactSchema).default([]),
  careerArc: z.array(BiographyChapterSchema).default([]),
  places: z.array(ProfileFactSchema).default([]),
  languages: z.array(ProfileFactSchema).default([]),
  domainExpertise: z.array(ProfileFactSchema).default([]),
  lifeContext: z.array(ProfileFactSchema).default([]),
});
export type Biography = z.infer<typeof BiographySchema>;

export const PersonaExampleSchema = z.object({
  situation: z.string(),
  preferredResponse: z.string(),
  why: z.string().optional(),
  channel: z.string().optional(),
});
export type PersonaExample = z.infer<typeof PersonaExampleSchema>;

export const AudienceModeSchema = z.object({
  id: z.string(),
  audience: z.string(),
  purpose: z.string().optional(),
  tone: z.enum(['warm', 'direct', 'formal', 'playful', 'calm']).optional(),
  directness: z.number().min(0).max(1).optional(),
  warmth: z.number().min(0).max(1).optional(),
  verbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
  structure: z
    .enum(['conversational', 'bulleted', 'narrative', 'mixed'])
    .optional(),
  leadWith: z
    .enum(['answer', 'context', 'empathy', 'options', 'recommendation'])
    .optional(),
  preferredPhrases: z.array(z.string()).default([]),
  avoidedPhrases: z.array(z.string()).default([]),
  formattingPreferences: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type AudienceMode = z.infer<typeof AudienceModeSchema>;

export const PersonaSchema = z.object({
  displayName: z.string().optional(),
  role: z.string().optional(),
  communicationStyle: z.string().optional(),
  tone: z.enum(['warm', 'direct', 'formal', 'playful', 'calm']).optional(),
  directness: z.number().min(0).max(1).optional(),
  warmth: z.number().min(0).max(1).optional(),
  verbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
  structure: z
    .enum(['conversational', 'bulleted', 'narrative', 'mixed'])
    .optional(),
  humor: z.enum(['none', 'light', 'playful']).optional(),
  preferredPhrases: z.array(z.string()).default([]),
  avoidedPhrases: z.array(z.string()).default([]),
  values: z.array(z.string()).default([]),
  riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
  workingHours: z.string().optional(),
  language: z.string().optional(),
  dialect: z.string().optional(),
  greetingStyle: z.enum(['none', 'brief', 'personal', 'contextual']).optional(),
  signoffStyle: z.enum(['none', 'brief', 'warm', 'name']).optional(),
  sentenceRhythm: z
    .enum(['crisp', 'conversational', 'reflective', 'varied'])
    .optional(),
  useContractions: z.boolean().optional(),
  punctuation: z.enum(['minimal', 'standard', 'expressive']).optional(),
  emojiPolicy: z.enum(['none', 'rare', 'contextual', 'frequent']).optional(),
  responseLength: z.enum(['one_line', 'short', 'medium', 'long']).optional(),
  leadWith: z
    .enum(['answer', 'context', 'empathy', 'options', 'recommendation'])
    .optional(),
  explainWith: z
    .enum(['examples', 'evidence', 'analogy', 'steps', 'tradeoffs'])
    .optional(),
  askStyle: z
    .enum(['one_question_at_a_time', 'grouped', 'minimal', 'exploratory'])
    .optional(),
  disagreementStyle: z
    .enum([
      'gentle_pushback',
      'challenge_with_reasoning',
      'direct_pushback',
      'defer',
    ])
    .optional(),
  empathyStyle: z
    .enum(['validating', 'practical', 'warm', 'minimal'])
    .optional(),
  formattingPreferences: z.array(z.string()).default([]),
  examples: z.array(PersonaExampleSchema).default([]),
  modes: z.array(AudienceModeSchema).default([]),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const IdentityProfileSchema = z.object({
  preferredName: z.string().optional(),
  pronouns: z.string().optional(),
  mission: z.string().optional(),
  organization: z.string().optional(),
  locale: z.string().default('en'),
  timezone: z.string().optional(),
  legalName: z.string().optional(),
  honorific: z.string().optional(),
  namePronunciation: z.string().optional(),
  selfDescription: z.string().optional(),
  languages: z.array(ProfileFactSchema).default([]),
  identityMarkers: z.array(ProfileFactSchema).default([]),
  affiliations: z.array(ProfileFactSchema).default([]),
  accessibilityNeeds: z.array(ProfileFactSchema).default([]),
});
export type IdentityProfile = z.infer<typeof IdentityProfileSchema>;

export const DecisionStyleSchema = z.object({
  priorities: z.array(z.string()).default([]),
  tradeoffs: z.array(z.string()).default([]),
  riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
  reversibilityPreference: z
    .enum(['reversible_first', 'balanced', 'decisive'])
    .optional(),
  asksBeforeCommitment: z.array(z.string()).default([]),
  confidenceFloor: z.number().min(0).max(1).optional(),
  northStars: z.array(z.string()).default([]),
  timeHorizon: z
    .enum(['immediate', 'quarter', 'annual', 'multi_year', 'mixed'])
    .optional(),
  defaultStance: z
    .enum(['curious', 'cautious', 'decisive', 'patient', 'experimental'])
    .optional(),
  evidenceThreshold: z.number().min(0).max(1).optional(),
  decisionProcess: z.array(z.string()).default([]),
  autonomyPreferences: z.array(z.string()).default([]),
  escalationTriggers: z.array(z.string()).default([]),
  redLines: z.array(z.string()).default([]),
  heuristics: z.array(z.string()).default([]),
  examples: z
    .array(
      z.object({
        situation: z.string(),
        decision: z.string(),
        reasoning: z.string(),
        outcome: z.string().optional(),
        lesson: z.string().optional(),
      }),
    )
    .default([]),
});
export type DecisionStyle = z.infer<typeof DecisionStyleSchema>;

export const BehavioralContractSchema = z.object({
  relationship: z
    .enum(['assistant', 'advisor', 'delegate', 'representative'])
    .default('assistant'),
  speakAs: z.enum(['agent', 'representative', 'collaborator']).default('agent'),
  discloseAgentIdentity: z.boolean().default(true),
  whenUncertain: z
    .enum(['ask', 'state_uncertainty', 'offer_options'])
    .default('ask'),
  whenDisagreeing: z
    .enum(['challenge_respectfully', 'surface_tradeoff', 'defer'])
    .default('challenge_respectfully'),
  whenWrong: z
    .enum(['admit_and_correct', 'explain_correction', 'brief_apology'])
    .default('admit_and_correct'),
  askBefore: z.array(z.string()).default([]),
  neverClaim: z.array(z.string()).default([]),
  neverDo: z.array(z.string()).default([]),
  responsePrinciples: z.array(z.string()).default([]),
  refusalStyle: z
    .enum(['brief_and_firm', 'explain_boundary', 'offer_safe_alternative'])
    .default('explain_boundary'),
  preserveHumanVoice: z.boolean().default(true),
  neverImpersonate: z.boolean().default(true),
});
export type BehavioralContract = z.infer<typeof BehavioralContractSchema>;

export const RelationalProfileSchema = z.object({
  trustSignals: z.array(ProfileFactSchema).default([]),
  trustBreakers: z.array(ProfileFactSchema).default([]),
  calmingFactors: z.array(ProfileFactSchema).default([]),
  frustrationTriggers: z.array(ProfileFactSchema).default([]),
  sensitiveTopics: z.array(ProfileFactSchema).default([]),
  acknowledgmentPreferences: z.array(z.string()).default([]),
  encouragementPreferences: z.array(z.string()).default([]),
  conflictPreferences: z.array(z.string()).default([]),
  repairProtocol: z.array(z.string()).default([]),
  emotionalContextNotes: z.array(ProfileFactSchema).default([]),
});
export type RelationalProfile = z.infer<typeof RelationalProfileSchema>;

export const BoundaryProfileSchema = z.object({
  neverAssume: z.array(z.string()).default([]),
  mustAsk: z.array(z.string()).default([]),
  neverMention: z.array(z.string()).default([]),
  neverInfer: z.array(z.string()).default([]),
  sensitiveTopics: z.array(z.string()).default([]),
  consentRules: z.array(z.string()).default([]),
  protectedAttributes: z.array(z.string()).default([]),
  privacyPreferences: z.array(z.string()).default([]),
});
export type BoundaryProfile = z.infer<typeof BoundaryProfileSchema>;

export const RelationshipContextSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string().optional(),
  context: z.string().optional(),
  goals: z.array(z.string()).default([]),
  sensitivities: z.array(z.string()).default([]),
  communicationPreferences: z.array(z.string()).default([]),
  trustLevel: z.enum(['new', 'developing', 'trusted', 'strained']).optional(),
  preferredCadence: z.string().optional(),
  boundaries: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  audience: z.string().optional(),
  sensitivity: z.enum(['normal', 'personal', 'sensitive']).default('normal'),
  confirmation: z
    .enum(['user_confirmed', 'agent_observed', 'inferred'])
    .default('user_confirmed'),
  confidence: z.number().min(0).max(1).default(1),
  validUntil: z.string().datetime().optional(),
});
export type RelationshipContext = z.infer<typeof RelationshipContextSchema>;

export const ResponseGuidanceSchema = z.object({
  style: z.array(z.string()).default([]),
  prioritize: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  whenUncertain: z.string().default('ask'),
  whenDisagreeing: z.string().default('challenge_respectfully'),
  whenWrong: z.string().default('admit_and_correct'),
  identityDisclosure: z
    .string()
    .default(
      'Be truthful that you are an AI agent acting with delegated context.',
    ),
  structure: z.string().optional(),
  identitySummary: z.array(z.string()).default([]),
  relationshipGuidance: z.array(z.string()).default([]),
  emotionalGuidance: z.array(z.string()).default([]),
  decisionGuidance: z.array(z.string()).default([]),
  audienceMode: z.string().optional(),
  relationshipId: z.string().optional(),
  refusalStyle: z.string().default('explain_boundary'),
  preserveHumanVoice: z.boolean().default(true),
});
export type ResponseGuidance = z.infer<typeof ResponseGuidanceSchema>;

export const HumanModelSchema = z.object({
  version: z.number().int().positive().default(1),
  identity: IdentityProfileSchema.default({}),
  persona: PersonaSchema.default({}),
  selfConcept: SelfConceptSchema.default({}),
  biography: BiographySchema.default({}),
  relationships: z.array(RelationshipContextSchema).default([]),
  relational: RelationalProfileSchema.default({}),
  boundaries: BoundaryProfileSchema.default({}),
  domain: z.lazy(() => DomainContextSchema).default({}),
  decision: DecisionStyleSchema.default({}),
  behavior: BehavioralContractSchema.default({}),
  responseGuidance: ResponseGuidanceSchema.default({
    whenUncertain: 'ask',
    whenDisagreeing: 'challenge_respectfully',
    whenWrong: 'admit_and_correct',
    identityDisclosure:
      'Be truthful that you are an AI agent acting with delegated context.',
  }),
  currentPriorities: z.array(z.string()).default([]),
  knownConstraints: z.array(z.string()).default([]),
});
export type HumanModel = z.infer<typeof HumanModelSchema>;

export const DomainContextSchema = z.object({
  business: z.string().optional(),
  icp: z.string().optional(),
  offer: z.string().optional(),
  industry: z.string().optional(),
  specialization: z.string().optional(),
  seniority: z.string().optional(),
  jurisdictions: z.array(z.string()).default([]),
  profession: z.string().optional(),
  exclusions: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  terminology: z.record(z.string()).default({}),
});
export type DomainContext = z.infer<typeof DomainContextSchema>;

export const ProfessionCategorySchema = z.enum([
  'business',
  'finance',
  'healthcare',
  'legal',
  'technology',
  'science',
  'education',
  'people_operations',
  'sales_marketing',
  'creative_media',
  'public_service',
  'social_services',
  'construction_trades',
  'manufacturing_logistics',
  'hospitality_retail',
  'agriculture_environment',
  'general',
]);
export type ProfessionCategory = z.infer<typeof ProfessionCategorySchema>;

export const ProfessionalPatternSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  useWhen: z.array(z.string()).default([]),
  avoidWhen: z.array(z.string()).default([]),
});
export type ProfessionalPattern = z.infer<typeof ProfessionalPatternSchema>;

/**
 * A reusable operating model for a profession. This describes work patterns
 * and safety boundaries; it is not a license, credential, or factual source.
 */
export const ProfessionProfileSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  category: ProfessionCategorySchema,
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  objective: z.string(),
  responsibilities: z.array(z.string()).default([]),
  knowledgeAreas: z.array(z.string()).default([]),
  operatingPatterns: z.array(ProfessionalPatternSchema).default([]),
  communicationPatterns: z.array(ProfessionalPatternSchema).default([]),
  decisionPatterns: z.array(ProfessionalPatternSchema).default([]),
  failureModes: z.array(z.string()).default([]),
  requiredContext: z.array(z.string()).default([]),
  escalationTriggers: z.array(z.string()).default([]),
  safetyBoundaries: z.array(z.string()).default([]),
  sensitiveDataClasses: z.array(z.string()).default([]),
  regulated: z.boolean().default(false),
  licenseRequiredFor: z.array(z.string()).default([]),
  restrictedActions: z.array(z.string()).default([]),
  approvalActions: z.array(z.string()).default([]),
  source: z.enum(['system', 'organization', 'human']).default('system'),
});
export type ProfessionProfile = z.infer<typeof ProfessionProfileSchema>;

/** The selected profession plus person-specific, attributable overrides. */
export const ProfessionalContextSchema = z.object({
  profileId: z.string().optional(),
  profileVersion: z.string().optional(),
  title: z.string().optional(),
  category: ProfessionCategorySchema.optional(),
  role: z.string().optional(),
  industry: z.string().optional(),
  specialization: z.string().optional(),
  seniority: z.string().optional(),
  jurisdictions: z.array(z.string()).default([]),
  objective: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  knowledgeAreas: z.array(z.string()).default([]),
  operatingPatterns: z.array(ProfessionalPatternSchema).default([]),
  communicationPatterns: z.array(ProfessionalPatternSchema).default([]),
  decisionPatterns: z.array(ProfessionalPatternSchema).default([]),
  failureModes: z.array(z.string()).default([]),
  escalationTriggers: z.array(z.string()).default([]),
  safetyBoundaries: z.array(z.string()).default([]),
  sensitiveDataClasses: z.array(z.string()).default([]),
  regulated: z.boolean().default(false),
  licenseRequiredFor: z.array(z.string()).default([]),
  restrictedActions: z.array(z.string()).default([]),
  approvalActions: z.array(z.string()).default([]),
  requiredContext: z.array(z.string()).default([]),
  missingContext: z.array(z.string()).default([]),
  humanFacts: z.array(ProfileFactSchema).default([]),
  source: z.enum(['system', 'organization', 'human']).default('system'),
});
export type ProfessionalContext = z.infer<typeof ProfessionalContextSchema>;

export const MemoryReferenceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmation: z
    .enum(['user_confirmed', 'agent_observed', 'inferred'])
    .optional(),
  priority: z.number().int().min(0).max(100).optional(),
  sensitivity: z.enum(['normal', 'personal', 'sensitive']).optional(),
  validUntil: z.string().optional(),
});
export type MemoryReference = z.infer<typeof MemoryReferenceSchema>;

export const MemoryContextSchema = z.object({
  preferences: z.array(z.string()).default([]),
  corrections: z.array(z.string()).default([]),
  episodes: z.array(z.string()).default([]),
  outcomes: z.array(z.record(z.unknown())).default([]),
  references: z.array(MemoryReferenceSchema).default([]),
  items: z.array(z.record(z.unknown())).default([]),
});
export type MemoryContext = z.infer<typeof MemoryContextSchema>;

export const ConversationTurnSchema = z.object({
  id: z.string(),
  role: z.enum(['human', 'agent', 'system']),
  content: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const InteractionContextSchema = z.object({
  conversationId: z.string().optional(),
  taskMetadata: z.record(z.unknown()).default({}),
  channel: z.string().optional(),
  audience: z.string().optional(),
  summary: z.string().optional(),
  activeTopic: z.string().optional(),
  userIntent: z.string().optional(),
  openLoops: z.array(z.string()).default([]),
  recentTurns: z.array(ConversationTurnSchema).default([]),
});
export type InteractionContext = z.infer<typeof InteractionContextSchema>;

export const GroundingSchema = z.object({
  precedence: z
    .array(z.string())
    .default([
      'explicit_correction',
      'explicit_preference',
      'active_boundary',
      'recent_outcome',
      'structured_profile',
      'inferred_memory',
    ]),
  conflicts: z.array(z.record(z.unknown())).default([]),
  uncertainties: z.array(z.string()).default([]),
  instructions: z.array(z.string()).default([]),
});
export type Grounding = z.infer<typeof GroundingSchema>;

export const AuthoritySchema = z.object({
  mayRead: z.array(z.string()).default([]),
  mayWrite: z.array(z.string()).default([]),
  mayDraft: z.array(z.string()).default([]),
  requiresApproval: z.array(z.string()).default([]),
  spendLimitUsd: z.number().nonnegative().optional(),
  maxRecipientCount: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
});
export type Authority = z.infer<typeof AuthoritySchema>;

export const JudgmentRulesSchema = z.object({
  askIfMissing: z.array(z.string()).default([]),
  escalateIf: z.array(z.string()).default([]),
  refuseIf: z.array(z.string()).default([]),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});
export type JudgmentRules = z.infer<typeof JudgmentRulesSchema>;

export const HumanIdentitySchema = z.object({
  humanId: z.string(),
  organizationId: z.string().optional(),
  displayName: z.string().optional(),
  role: z.string().optional(),
  preferredName: z.string().optional(),
  pronouns: z.string().optional(),
  mission: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  selfDescription: z.string().optional(),
});
export type HumanIdentity = z.infer<typeof HumanIdentitySchema>;

export const HumanContextPacketSchema = z.object({
  schemaVersion: z.enum(['1', '2', '3', '4']),
  packetId: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  task: z.string(),
  taskHash: z.string(),
  principal: HumanIdentitySchema,
  agent: z.object({
    agentId: z.string(),
    runtime: z.string(),
    delegationId: z.string(),
  }),
  persona: PersonaSchema,
  domain: DomainContextSchema,
  professional: z.lazy(() => ProfessionalContextSchema).default({}),
  memory: MemoryContextSchema,
  authority: AuthoritySchema,
  judgment: JudgmentRulesSchema,
  policyVersion: z.string(),
  redactions: z.array(z.string()).default([]),
  humanModel: HumanModelSchema.default({}),
  behavior: BehavioralContractSchema.default({}),
  responseGuidance: ResponseGuidanceSchema.default({
    whenUncertain: 'ask',
    whenDisagreeing: 'challenge_respectfully',
    whenWrong: 'admit_and_correct',
    identityDisclosure:
      'Be truthful that you are an AI agent acting with delegated context.',
  }),
  interaction: InteractionContextSchema.default({}),
  grounding: GroundingSchema.default({}),
});
export type HumanContextPacket = z.infer<typeof HumanContextPacketSchema>;

export interface ExpertProfile {
  id: string;
  version: string;
  status?: 'available' | 'planned';
  name: string;
  objective: string;
  requiredContext: string[];
  behavioralFocus?: string[];
  failureModes?: string[];
  workflow: string[];
  successMetric: string;
  judgment: JudgmentRules;
}

export interface MemoryRecord {
  id: string;
  humanId: string;
  organizationId?: string;
  kind:
    | 'identity'
    | 'preference'
    | 'boundary'
    | 'correction'
    | 'episode'
    | 'outcome'
    | 'domain_knowledge'
    | 'relationship';
  content: string | Record<string, unknown>;
  confidence?: number;
  source?: string;
  confirmation?: 'user_confirmed' | 'agent_observed' | 'inferred';
  priority?: number;
  sensitivity?: 'normal' | 'personal' | 'sensitive';
  externalRef?: string;
  validFrom?: string;
  validUntil?: string;
  supersededBy?: string;
  createdAt: string;
}
