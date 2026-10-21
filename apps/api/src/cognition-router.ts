import {
  CognitionRouteSchema,
  type ContextEntry,
  type CognitionRisk,
  type CognitionRoute,
  type ProfessionProfile,
} from '@deal/core';
import {
  contextEntryCatalog,
  getContextEntry,
  getProfessionProfile,
  professionCatalog,
} from './professions.js';

export interface CognitionRoutingInput {
  task: string;
  humanRole?: string;
  declaredProfession?: string;
  domain?: string[];
}

type CandidateScore = {
  profile: ProfessionProfile;
  entry: ContextEntry;
  score: number;
  signals: string[];
};

const urgentSignals = [
  'emergency',
  'urgent',
  'severe',
  'critical',
  'chest pain',
  'cannot breathe',
  'shortness of breath',
  'unconscious',
  'overdose',
  'self harm',
  'suicidal',
  'violence',
  'immediate danger',
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(task: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  return ` ${task} `.includes(` ${normalizedTerm} `);
}

function matchTerms(task: string, terms: string[]): string[] {
  return [...new Set(terms.filter((term) => includesTerm(task, term)))].slice(
    0,
    8,
  );
}

function profileTerms(profile: ProfessionProfile): string[] {
  return [
    profile.title,
    profile.category,
    ...profile.aliases,
    ...profile.knowledgeAreas,
    ...profile.responsibilities,
  ];
}

function scoreProfile(
  task: string,
  profile: ProfessionProfile,
  declaredProfession?: string,
  humanRole?: string,
  domain: string[] = [],
): CandidateScore {
  const entry = getContextEntry(profile.id);
  const routingMatches = matchTerms(
    task,
    entry?.routing.terms.map((term) => term.term) ?? profile.routingTerms,
  );
  const negativeMatches = matchTerms(task, entry?.routing.negativeTerms ?? []);
  const aliasMatches = matchTerms(task, [profile.title, ...profile.aliases]);
  const knowledgeMatches = matchTerms(task, [
    ...profile.knowledgeAreas,
    ...profile.responsibilities,
  ]);
  const signals = [
    ...routingMatches.map((term) => `task:${term}`),
    ...aliasMatches
      .filter((term) => !routingMatches.includes(term))
      .map((term) => `profile:${term}`),
    ...knowledgeMatches
      .filter(
        (term) =>
          !routingMatches.includes(term) && !aliasMatches.includes(term),
      )
      .map((term) => `knowledge:${term}`),
  ];
  let score = entry
    ? entry.routing.terms
        .filter((term) => routingMatches.includes(term.term))
        .reduce(
          (total, term) => total + term.weight * (term.ambiguous ? 3 : 8),
          0,
        )
    : routingMatches.length * 5;
  if (negativeMatches.length) {
    score -= negativeMatches.length * 20;
    signals.push(...negativeMatches.map((term) => `negative:${term}`));
  }
  score += aliasMatches.length * 4;
  score += knowledgeMatches.length * 1.5;

  const declared = normalize(declaredProfession ?? '');
  const role = normalize(humanRole ?? '');
  const declaredMatch =
    declared === normalize(profile.id) ||
    declared === normalize(profile.title) ||
    profile.aliases.some((alias) => declared === normalize(alias));
  const roleMatch =
    role.length > 0 &&
    profileTerms(profile).some((term) => role.includes(normalize(term)));
  const domainMatch = domain.some((value) =>
    profileTerms(profile).some((term) =>
      normalize(value).includes(normalize(term)),
    ),
  );

  if (declaredMatch) {
    score += 3;
    signals.push('identity:declared-profession');
  }
  if (roleMatch) {
    score += 2;
    signals.push('identity:role');
  }
  if (domainMatch) {
    score += 2;
    signals.push('domain:declared');
  }

  return {
    profile,
    entry: entry ?? contextEntryCatalog[0]!,
    score,
    signals: [...new Set(signals)].slice(0, 12),
  };
}

function riskFor(profile: ProfessionProfile, task: string): CognitionRisk {
  const urgent = urgentSignals.some((signal) => includesTerm(task, signal));
  if (urgent) return 'critical';
  if (profile.regulated || profile.sensitiveDataClasses.length > 0)
    return 'high';
  if (profile.category !== 'general') return 'moderate';
  return 'low';
}

function confidenceFor(
  selected: CandidateScore,
  second: CandidateScore | undefined,
  declared: boolean,
): number {
  if (selected.score <= 0) return declared ? 0.62 : 0.25;
  const separation = selected.score - (second?.score ?? 0);
  const base = Math.min(0.92, 0.35 + selected.score / 24);
  const margin = Math.min(0.2, Math.max(0, separation) / 30);
  return Number(Math.min(0.98, base + margin).toFixed(3));
}

/**
 * Selects task-level professional understanding without changing the human's
 * identity. It is deterministic by design: an organization can inspect the
 * matched signals and replace the catalog with reviewed profiles later.
 */
export function routeTaskCognition(
  input: CognitionRoutingInput,
): CognitionRoute {
  const task = normalize(input.task);
  const candidates = professionCatalog
    .filter((profile) => profile.id !== 'generalist_assistant_v1')
    .map((profile) =>
      scoreProfile(
        task,
        profile,
        input.declaredProfession,
        input.humanRole,
        input.domain,
      ),
    );
  const identityContextRequest =
    /\b(my|your|their|the user's)\s+(race|gender|background|identity|religion|sexuality|nationality|persona|profile|pronouns)\b/.test(
      task,
    ) ||
    /\b(what do you know about me|human context|context engineering|identity model|persona design)\b/.test(
      task,
    );
  if (identityContextRequest) {
    const cognitive = candidates.find(
      (candidate) => candidate.profile.id === 'cognitive_engineer_v1',
    );
    if (cognitive) {
      cognitive.score += 20;
      cognitive.signals.push('context:identity-management');
    }
  }
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.profile.routingPriority - left.profile.routingPriority,
  );
  const generalist =
    getProfessionProfile('generalist_assistant_v1') ?? professionCatalog[0];
  const selected =
    candidates[0]?.score > 0
      ? candidates[0]
      : {
          profile: generalist,
          entry: getContextEntry(generalist.id) ?? contextEntryCatalog[0]!,
          score: 0,
          signals: ['route:generalist'],
        };
  const declaredProfile = input.declaredProfession
    ? getProfessionProfile(input.declaredProfession)
    : undefined;
  const routeProfile = selected.profile;
  const matchedTerms = matchTerms(task, routeProfile.routingTerms);
  const confidence = confidenceFor(
    selected,
    candidates[1],
    Boolean(declaredProfile && routeProfile.id === declaredProfile.id),
  );
  const route = {
    routeId: `task_${routeProfile.category}_${routeProfile.id}`,
    profileId: routeProfile.id,
    profileVersion: routeProfile.version,
    title: routeProfile.title,
    subjectType: routeProfile.subjectType,
    category: routeProfile.category,
    summary: routeProfile.summary,
    objective: routeProfile.objective,
    responsibilities: routeProfile.responsibilities,
    knowledgeAreas: routeProfile.knowledgeAreas,
    operatingPatterns: routeProfile.operatingPatterns,
    communicationPatterns: routeProfile.communicationPatterns,
    decisionPatterns: routeProfile.decisionPatterns,
    failureModes: routeProfile.failureModes,
    requiredContext: routeProfile.requiredContext,
    escalationTriggers: routeProfile.escalationTriggers,
    escalation: selected.entry.escalation,
    safetyBoundaries: routeProfile.safetyBoundaries,
    sensitiveDataClasses: routeProfile.sensitiveDataClasses,
    regulated: routeProfile.regulated,
    licenseRequiredFor: routeProfile.licenseRequiredFor,
    restrictedActions: routeProfile.restrictedActions,
    approvalActions: routeProfile.approvalActions,
    contextAccess: 'automatic',
    confidence,
    risk: riskFor(routeProfile, task),
    signals: [...selected.signals, `task:category:${routeProfile.category}`],
    retrievedPatterns: [
      ...routeProfile.operatingPatterns,
      ...routeProfile.communicationPatterns,
      ...routeProfile.decisionPatterns,
    ].map((pattern) => pattern.id),
    transientFacts: matchedTerms.map((term) => `matched:${term}`),
    responsePlan: {
      leadWith: 'answer',
      askAtMost: 1,
      avoid: routeProfile.failureModes.slice(0, 6),
      escalateWhen: routeProfile.escalationTriggers.slice(0, 8),
    },
    source: routeProfile.source,
    routeVersion: '1',
    routeReason: selected.entry.summary,
  };
  return CognitionRouteSchema.parse(route);
}
