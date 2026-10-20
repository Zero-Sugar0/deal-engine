import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Approval = {
  id: string;
  action: string;
  summary: string;
  status: string;
  createdAt: string;
  payloadHash: string;
};
type AuditEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};
type Workflow = {
  id: string;
  profileId: string;
  goal: string;
  currentStep: string;
  updatedAt: string;
};
type ProfileFact = {
  value: string;
  confirmation?: string;
  confidence?: number;
  sensitivity?: string;
};
type Profile = {
  human: {
    displayName: string;
    role: string;
    identity: {
      preferredName?: string;
      mission?: string;
      organization?: string;
      locale?: string;
      timezone?: string;
      selfDescription?: string;
      languages?: ProfileFact[];
      identityMarkers?: ProfileFact[];
      affiliations?: ProfileFact[];
    };
    selfConcept: {
      summary?: string;
      identityStatements?: ProfileFact[];
      strengths?: ProfileFact[];
      growthEdges?: ProfileFact[];
      aspirations?: ProfileFact[];
      fears?: ProfileFact[];
      nonNegotiables?: ProfileFact[];
      valuesHierarchy?: Array<{
        value: string;
        priority?: number;
        meaning?: string;
      }>;
      howTheyDescribeThemselves?: string[];
    };
    biography: {
      summary?: string;
      currentChapter?: string;
      formativeExperiences?: ProfileFact[];
      careerArc?: Array<{
        title: string;
        summary: string;
        period?: string;
        lessons?: string[];
      }>;
      domainExpertise?: ProfileFact[];
      lifeContext?: ProfileFact[];
    };
    relationships: Array<{
      id: string;
      label: string;
      role?: string;
      context?: string;
      trustLevel?: string;
      communicationPreferences?: string[];
      boundaries?: string[];
    }>;
    relational: {
      trustSignals?: ProfileFact[];
      trustBreakers?: ProfileFact[];
      calmingFactors?: ProfileFact[];
      frustrationTriggers?: ProfileFact[];
      acknowledgmentPreferences?: string[];
      repairProtocol?: string[];
    };
    boundaries: {
      neverAssume?: string[];
      mustAsk?: string[];
      neverMention?: string[];
      neverInfer?: string[];
      consentRules?: string[];
      privacyPreferences?: string[];
    };
    domain: {
      business?: string;
      icp?: string;
      offer?: string;
      exclusions?: string[];
    };
    persona: {
      communicationStyle?: string;
      tone?: string;
      directness?: number;
      warmth?: number;
      verbosity?: string;
      values?: string[];
      preferredPhrases?: string[];
      avoidedPhrases?: string[];
      greetingStyle?: string;
      signoffStyle?: string;
      sentenceRhythm?: string;
      useContractions?: boolean;
      emojiPolicy?: string;
      leadWith?: string;
      explainWith?: string;
      askStyle?: string;
      formattingPreferences?: string[];
      modes?: Array<{ id: string; audience: string; purpose?: string }>;
    };
    decision: {
      priorities?: string[];
      tradeoffs?: string[];
      riskTolerance?: string;
      reversibilityPreference?: string;
      northStars?: string[];
      heuristics?: string[];
      decisionProcess?: string[];
      redLines?: string[];
    };
    behavior: {
      relationship?: string;
      speakAs?: string;
      whenUncertain?: string;
      whenDisagreeing?: string;
      whenWrong?: string;
      responsePrinciples?: string[];
      neverClaim?: string[];
      neverDo?: string[];
    };
    currentPriorities?: string[];
    knownConstraints?: string[];
  };
  delegations: Array<{
    id: string;
    purpose: string;
    profileId?: string;
    authority: {
      mayRead?: string[];
      mayDraft?: string[];
      mayWrite?: string[];
      requiresApproval?: string[];
    };
  }>;
};

const API_DEFAULT =
  import.meta.env.VITE_DEAL_API_URL ?? 'https://deal-engine.up.railway.app';

function factValues(items: ProfileFact[] | undefined): string[] {
  return (items ?? []).map((item) => item.value);
}

function lineValues(items: string[] | undefined): string[] {
  return items ?? [];
}

function App() {
  const [apiUrl, setApiUrl] = useState(
    localStorage.getItem('deal_api_url') ?? API_DEFAULT,
  );
  const [token, setToken] = useState(
    localStorage.getItem('deal_human_token') ?? 'local-human-key',
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token],
  );
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? `Request failed: ${response.status}`);
    return body as T;
  }

  async function refresh() {
    setLoading(true);
    setError('');
    localStorage.setItem('deal_api_url', apiUrl);
    localStorage.setItem('deal_human_token', token);
    try {
      const [nextProfile, nextApprovals, nextAudit, nextWorkflows] =
        await Promise.all([
          request<Profile>('/v1/profile'),
          request<Approval[]>('/v1/approvals'),
          request<AuditEvent[]>('/v1/audit'),
          request<Workflow[]>('/v1/workflows'),
        ]);
      setProfile(nextProfile);
      setApprovals(nextApprovals);
      setAudit(nextAudit);
      setWorkflows(nextWorkflows);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to connect to DEAL',
      );
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, decision: 'approved' | 'denied') {
    await request(`/v1/approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    await refresh();
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">DEAL / CONTROL PLANE</span>
          <h1>Human context, with judgment.</h1>
        </div>
        <button className="ghost" onClick={() => void refresh()}>
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
      </header>

      <section className="connection panel">
        <div>
          <label>
            API URL
            <input
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
          </label>
        </div>
        <div>
          <label>
            Human token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
        </div>
        <button onClick={() => void refresh()}>Connect</button>
      </section>
      {error && <div className="error">{error}</div>}

      {profile && (
        <>
          <section className="hero-grid">
            <article className="panel hero">
              <span className="eyebrow">PRINCIPAL</span>
              <h2>{profile.human.displayName}</h2>
              <p>
                {profile.human.role} · {profile.human.domain.business}
              </p>
              <div className="quote">
                “
                {profile.human.persona.communicationStyle ??
                  'Context-aware and truthful'}
                ”
              </div>
            </article>
            <article className="panel">
              <span className="eyebrow">HUMAN CONTEXT</span>
              <h3>Mission</h3>
              <p>{profile.human.identity.mission ?? 'Not defined yet.'}</p>
              <h3>Ideal customer profile</h3>
              <p>{profile.human.domain.icp}</p>
              <h3>Boundaries and current priorities</h3>
              <div className="chips">
                {(profile.human.domain.exclusions ?? []).map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
                {(profile.human.currentPriorities ?? []).map((item) => (
                  <span className="chip priority" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          </section>
          <section className="three-col">
            <article className="panel">
              <span className="eyebrow">SELF-CONCEPT</span>
              <h3>How this person understands themselves</h3>
              <p>{profile.human.selfConcept.summary ?? 'Not defined yet.'}</p>
              <div className="chips">
                {lineValues(
                  profile.human.selfConcept.howTheyDescribeThemselves,
                ).map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <h4>Non-negotiables</h4>
              <ul>
                {factValues(profile.human.selfConcept.nonNegotiables).map(
                  (item) => (
                    <li key={item}>{item}</li>
                  ),
                )}
              </ul>
            </article>
            <article className="panel">
              <span className="eyebrow">BIOGRAPHY</span>
              <h3>Personal and professional context</h3>
              <p>{profile.human.biography.summary ?? 'Not defined yet.'}</p>
              <p className="muted">
                {profile.human.biography.currentChapter ??
                  'No current chapter recorded.'}
              </p>
              <h4>Expertise</h4>
              <div className="chips">
                {factValues(profile.human.biography.domainExpertise).map(
                  (item) => (
                    <span className="chip" key={item}>
                      {item}
                    </span>
                  ),
                )}
              </div>
            </article>
            <article className="panel">
              <span className="eyebrow">VALUES HIERARCHY</span>
              <h3>What wins when values conflict</h3>
              <div className="value-list">
                {(profile.human.selfConcept.valuesHierarchy ?? []).map(
                  (item) => (
                    <div className="value-row" key={item.value}>
                      <strong>{item.value}</strong>
                      <span>{item.priority ?? 50}</span>
                      <small>{item.meaning ?? 'Priority in judgment'}</small>
                    </div>
                  ),
                )}
              </div>
            </article>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <span className="eyebrow">HUMAN MODEL</span>
                <h2>How this person wants to be represented</h2>
              </div>
              <span className="count">
                {profile.human.behavior.relationship}
              </span>
            </div>
            <div className="model-grid">
              <div>
                <span className="eyebrow">VOICE</span>
                <p>
                  {profile.human.persona.tone ?? 'balanced'} tone ·{' '}
                  {profile.human.persona.verbosity ?? 'balanced'} ·{' '}
                  {Math.round((profile.human.persona.directness ?? 0.5) * 100)}%
                  direct
                </p>
              </div>
              <div>
                <span className="eyebrow">DECISION STYLE</span>
                <p>
                  {profile.human.decision.riskTolerance ?? 'balanced'} risk ·{' '}
                  {profile.human.decision.reversibilityPreference ?? 'balanced'}
                </p>
              </div>
              <div>
                <span className="eyebrow">WHEN UNCERTAIN</span>
                <p>
                  {profile.human.behavior.whenUncertain ?? 'State uncertainty'}
                </p>
              </div>
              <div>
                <span className="eyebrow">WHEN WRONG</span>
                <p>{profile.human.behavior.whenWrong ?? 'Admit and correct'}</p>
              </div>
              <div>
                <span className="eyebrow">COMMUNICATION MECHANICS</span>
                <p>
                  {profile.human.persona.greetingStyle ?? 'brief'} greeting ·{' '}
                  {profile.human.persona.sentenceRhythm ?? 'varied'} rhythm ·{' '}
                  {profile.human.persona.askStyle ?? 'minimal'} questions
                </p>
              </div>
              <div>
                <span className="eyebrow">DECISION HEURISTICS</span>
                <p>
                  {(profile.human.decision.heuristics ?? []).join(' · ') ||
                    'Not defined yet.'}
                </p>
              </div>
            </div>
            <div className="three-col compact-grid">
              <div>
                <span className="eyebrow">TRUST SIGNALS</span>
                <ul>
                  {factValues(profile.human.relational.trustSignals).map(
                    (item) => (
                      <li key={item}>{item}</li>
                    ),
                  )}
                </ul>
              </div>
              <div>
                <span className="eyebrow">TRUST BREAKERS</span>
                <ul>
                  {factValues(profile.human.relational.trustBreakers).map(
                    (item) => (
                      <li key={item}>{item}</li>
                    ),
                  )}
                </ul>
              </div>
              <div>
                <span className="eyebrow">CONSENT AND BOUNDARIES</span>
                <ul>
                  {lineValues(profile.human.boundaries.mustAsk).map((item) => (
                    <li key={item}>Ask: {item}</li>
                  ))}
                  {lineValues(profile.human.boundaries.neverInfer).map(
                    (item) => (
                      <li key={item}>Never infer: {item}</li>
                    ),
                  )}
                </ul>
              </div>
            </div>
            <div className="agents">
              <span className="eyebrow">CONNECTED AGENT RELATIONSHIPS</span>
              {profile.delegations.map((delegation) => (
                <div className="agent" key={delegation.id}>
                  <div>
                    <strong>
                      {delegation.profileId ?? 'General context relationship'}
                    </strong>
                    <p>{delegation.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="agents">
              <span className="eyebrow">AUDIENCE MODES</span>
              {(profile.human.persona.modes ?? []).map((mode) => (
                <div className="agent" key={mode.id}>
                  <div>
                    <strong>{mode.audience}</strong>
                    <p>
                      {mode.purpose ?? 'Audience-specific communication mode'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="panel workflow-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">PLAYBOOK STATE</span>
            <h2>Expert workflows</h2>
          </div>
          <span className="count">{workflows.length} runs</span>
        </div>
        {workflows.length === 0 ? (
          <p className="muted">No workflow runs yet.</p>
        ) : (
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <div className="workflow" key={workflow.id}>
                <div>
                  <strong>{workflow.profileId}</strong>
                  <p>{workflow.goal}</p>
                </div>
                <div>
                  <span className="status">{workflow.currentStep}</span>
                  <small>{new Date(workflow.updatedAt).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="two-col">
        <article className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">HUMAN CHECKPOINT</span>
              <h2>Approvals</h2>
            </div>
            <span className="count">
              {approvals.filter((item) => item.status === 'pending').length}{' '}
              pending
            </span>
          </div>
          {approvals.length === 0 ? (
            <p className="muted">No approval requests.</p>
          ) : (
            <div className="approval-list">
              {approvals.map((approval) => (
                <div className="approval" key={approval.id}>
                  <div>
                    <strong>{approval.action}</strong>
                    <p>{approval.summary}</p>
                    <small>
                      {new Date(approval.createdAt).toLocaleString()}
                    </small>
                  </div>
                  <div className="actions">
                    {approval.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => void decide(approval.id, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="danger"
                          onClick={() => void decide(approval.id, 'denied')}
                        >
                          Deny
                        </button>
                      </>
                    ) : (
                      <span className={`status ${approval.status}`}>
                        {approval.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">IMMUTABLE TRAIL</span>
              <h2>Recent audit</h2>
            </div>
          </div>
          <div className="audit-list">
            {audit
              .slice(-8)
              .reverse()
              .map((event) => (
                <div className="audit" key={event.id}>
                  <span className="dot" />
                  <div>
                    <strong>{event.eventType}</strong>
                    <p>{new Date(event.occurredAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
