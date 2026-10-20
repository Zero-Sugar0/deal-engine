import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authClient, dealApiUrl, getDealSessionToken } from './auth-client';

type Navigate = (path: string) => void;

type Human = {
  id: string;
  displayName: string;
  email: string;
  organizationId: string;
  role?: string;
  modelVersion?: number;
  identity?: Record<string, unknown>;
  persona?: Record<string, unknown>;
  selfConcept?: Record<string, unknown>;
  biography?: Record<string, unknown>;
  relationships?: Array<Record<string, unknown>>;
  relational?: Record<string, unknown>;
  boundaries?: Record<string, unknown>;
  domain?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  behavior?: Record<string, unknown>;
  currentPriorities?: string[];
  knownConstraints?: string[];
  onboarding?: {
    role?: string;
    focus?: string;
    referralSource?: string;
    completedAt?: string;
  };
};

type ProfileResponse = { human: Human };

type Agent = {
  id: string;
  name: string;
  runtime: string;
  status: 'active' | 'suspended';
  credentials: Array<{
    id: string;
    name?: string;
    createdAt?: string;
    active: boolean;
    expiresAt?: string;
    revokedAt?: string;
  }>;
};

type Memory = {
  id: string;
  kind: string;
  content: string | Record<string, unknown>;
  confirmation?: string;
  confidence?: number;
  source?: string;
  createdAt: string;
};

type Approval = {
  id: string;
  agentId: string;
  action: string;
  summary: string;
  payload: unknown;
  payloadHash: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  policyResult?: { reason?: string; risk?: string };
};

type AuditEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const token = getDealSessionToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${dealApiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!response.ok)
    throw new Error(
      body.error || body.message || `Request failed (${response.status})`,
    );
  return body;
}

function display(value: unknown, fallback = 'Not set yet'): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const values = value.filter(
      (item): item is string => typeof item === 'string',
    );
    return values.length ? values.join(' · ') : fallback;
  }
  return fallback;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

function prettyKind(value: string): string {
  return value.replaceAll('_', ' ');
}

function prettyDate(value?: string): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'D'
  );
}

function SmallButton({
  children,
  onClick,
  type = 'button',
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`account-button ${secondary ? 'account-button-secondary' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function AccountLogo({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <button
      className="account-logo"
      onClick={() => onNavigate('/')}
      type="button"
    >
      <img src="/deal-mark.svg" alt="" width="25" height="25" />
      <span>deal</span>
    </button>
  );
}

const roleOptions = [
  ['developer', 'Developer', 'Building products, systems, or agents'],
  ['founder', 'Founder', 'Making decisions and moving a company forward'],
  ['designer', 'Designer', 'Shaping ideas, experiences, and direction'],
  ['operator', 'Operator', 'Keeping important work clear and moving'],
  ['researcher', 'Researcher', 'Working with evidence, questions, and insight'],
  ['other', 'Something else', 'A different kind of work, done your way'],
];

const focusOptions = [
  ['voice', 'Sound like me', 'Keep my tone and way of thinking close'],
  [
    'decisions',
    'Make better decisions',
    'Give agents the judgment behind my choices',
  ],
  [
    'continuity',
    'Keep the thread',
    'Carry context between conversations and tools',
  ],
  [
    'boundaries',
    'Protect what matters',
    'Make limits and human checkpoints visible',
  ],
];

const referralOptions = [
  'LinkedIn',
  'X',
  'Reddit',
  'Google search',
  'YouTube',
  'A friend',
  'Other',
];

export function OnboardingPage({ onNavigate }: { onNavigate: Navigate }) {
  const { data: session, isPending } = authClient.useSession();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState('');
  const [focus, setFocus] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isPending && !session && !getDealSessionToken())
      onNavigate('/sign-in');
  }, [isPending, onNavigate, session]);

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setBusy(true);
    try {
      await request('/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({ role, focus, referralSource }),
      });
      onNavigate('/app');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save your answers.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (isPending || (!session && !getDealSessionToken())) return null;

  const steps = [
    {
      eyebrow: 'First, a little about you',
      title: 'What kind of work is yours?',
      body: 'This helps deal choose a useful starting point. You can change it later.',
      options: roleOptions,
      value: role,
      setValue: setRole,
    },
    {
      eyebrow: 'What should feel better?',
      title: 'Where should your agent understand you first?',
      body: 'Choose the part of working with AI you care about most right now.',
      options: focusOptions,
      value: focus,
      setValue: setFocus,
    },
  ];
  const current = steps[step];

  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <AccountLogo onNavigate={onNavigate} />
        <span>Step {step + 1} of 3</span>
      </header>
      <main className="onboarding-main">
        <div className="onboarding-progress">
          <i style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
        {step < 2 && current ? (
          <section className="onboarding-card">
            <span className="eyebrow">{current.eyebrow}</span>
            <h1>{current.title}</h1>
            <p>{current.body}</p>
            <div className="choice-grid">
              {current.options.map(([value, title, description]) => (
                <button
                  className={`choice-card ${current.value === value ? 'choice-card-selected' : ''}`}
                  key={value}
                  onClick={() => current.setValue(value)}
                  type="button"
                >
                  <span className="choice-mark">
                    {current.value === value ? '✓' : ''}
                  </span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <SmallButton
                secondary
                onClick={() => (step === 0 ? onNavigate('/app') : setStep(0))}
              >
                Back
              </SmallButton>
              <SmallButton
                disabled={!current.value}
                onClick={() => setStep(step + 1)}
              >
                Continue ↗
              </SmallButton>
            </div>
          </section>
        ) : (
          <form className="onboarding-card" onSubmit={finish}>
            <span className="eyebrow">One last question</span>
            <h1>How did you find deal?</h1>
            <p>
              It helps us understand how people discover a more human way to
              work with AI.
            </p>
            <div className="referral-grid">
              {referralOptions.map((option) => (
                <button
                  className={`referral-option ${referralSource === option ? 'referral-option-selected' : ''}`}
                  key={option}
                  onClick={() => setReferralSource(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            {errorMessage && (
              <div className="account-error">{errorMessage}</div>
            )}
            <div className="onboarding-actions">
              <SmallButton secondary onClick={() => setStep(1)}>
                Back
              </SmallButton>
              <SmallButton disabled={!referralSource || busy} type="submit">
                {busy ? 'Saving…' : 'Enter deal ↗'}
              </SmallButton>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

const navItems = [
  ['Overview', '◌'],
  ['Human model', '◈'],
  ['Memory', '⌁'],
  ['Developer', '◇'],
  ['Approvals', '✓'],
] as const;

export function AccountExperience({ onNavigate }: { onNavigate: Navigate }) {
  const [active, setActive] =
    useState<(typeof navItems)[number][0]>('Overview');
  const [profile, setProfile] = useState<Human>();
  const [approvalCount, setApprovalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { data: session, isPending: sessionPending } = authClient.useSession();

  async function loadShell() {
    const [profileResponse, approvals] = await Promise.all([
      request<ProfileResponse>('/v1/profile'),
      request<Approval[]>('/v1/approvals'),
    ]);
    setProfile(profileResponse.human);
    setApprovalCount(
      approvals.filter((item) => item.status === 'pending').length,
    );
  }

  useEffect(() => {
    if (sessionPending) return;
    if (!session && !getDealSessionToken()) {
      onNavigate('/sign-in');
      return;
    }
    loadShell()
      .catch(() => {
        onNavigate('/sign-in');
      })
      .finally(() => setLoading(false));
  }, [onNavigate, session, sessionPending]);

  async function signOut() {
    await authClient.signOut();
    onNavigate('/sign-in');
  }

  if (loading || sessionPending || !profile) return null;

  const heading =
    active === 'Overview'
      ? `Good morning, ${profile.displayName.split(' ')[0]}.`
      : active;
  return (
    <div className="account-shell">
      <aside className="account-sidebar">
        <AccountLogo onNavigate={onNavigate} />
        <div className="account-person">
          <span className="account-avatar">
            {initials(profile.displayName)}
          </span>
          <span>
            <strong>{profile.displayName}</strong>
            <small>{profile.email}</small>
          </span>
        </div>
        <nav className="account-nav" aria-label="Your account">
          {navItems.map(([label, icon]) => (
            <button
              className={active === label ? 'account-nav-active' : ''}
              key={label}
              onClick={() => setActive(label)}
              type="button"
            >
              <span>{icon}</span>
              {label}
              {label === 'Approvals' && approvalCount > 0 && (
                <b>{approvalCount}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="account-sidebar-bottom">
          <button onClick={() => onNavigate('/')} type="button">
            ↗ <span>View deal</span>
          </button>
          <button onClick={signOut} type="button">
            ↪ <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="account-main">
        <header className="account-header">
          <div>
            <span className="eyebrow">
              {active === 'Overview' ? 'Your model at a glance' : 'Your model'}
            </span>
            <h1>{heading}</h1>
          </div>
          <div className="account-header-meta">
            <span>
              <i /> Connected
            </span>
            <button className="account-header-avatar" type="button">
              {initials(profile.displayName)}
            </button>
          </div>
        </header>
        {active === 'Overview' && (
          <OverviewView profile={profile} onNavigate={setActive} />
        )}
        {active === 'Human model' && (
          <HumanModelView profile={profile} setProfile={setProfile} />
        )}
        {active === 'Memory' && <MemoryView />}
        {active === 'Developer' && <DeveloperView />}
        {active === 'Approvals' && <ApprovalsView onChanged={loadShell} />}
      </main>
    </div>
  );
}

function OverviewView({
  profile,
  onNavigate,
}: {
  profile: Human;
  onNavigate: (value: (typeof navItems)[number][0]) => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    Promise.all([
      request<{ agents: Agent[] }>('/v1/agents'),
      request<Memory[]>('/v1/memory'),
      request<Approval[]>('/v1/approvals'),
      request<AuditEvent[]>('/v1/audit'),
    ])
      .then(
        ([agentResponse, memoryResponse, approvalResponse, auditResponse]) => {
          setAgents(agentResponse.agents);
          setMemories(memoryResponse);
          setApprovals(approvalResponse);
          setEvents(auditResponse.slice(-5).reverse());
        },
      )
      .catch((error) =>
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not load your model.',
        ),
      );
  }, []);

  const pending = approvals.filter((item) => item.status === 'pending');
  const voice = display(
    profile.persona?.communicationStyle || profile.persona?.tone,
    'Add your voice',
  );
  const values = list(profile.persona?.values);
  const priorities = profile.currentPriorities ?? [];
  return (
    <div className="account-content">
      <section className="account-hero-card">
        <div>
          <span className="eyebrow">Your human model</span>
          <h2>
            Understanding that
            <br />
            <em>travels with you.</em>
          </h2>
          <p>
            {profile.identity?.mission
              ? display(profile.identity.mission)
              : 'Your model is the place where your voice, choices, and boundaries become useful to every agent you use.'}
          </p>
          <button
            className="account-text-link"
            onClick={() => onNavigate('Human model')}
            type="button"
          >
            Review your model ↗
          </button>
        </div>
        <div className="model-signal">
          <div className="signal-top">
            <i /> model is live <span>v{profile.modelVersion ?? 1}</span>
          </div>
          <strong>{voice}</strong>
          <small>Voice · priorities · boundaries</small>
          <div className="signal-rule">
            <i />
          </div>
        </div>
      </section>
      {errorMessage && <div className="account-error">{errorMessage}</div>}
      <section className="account-stat-grid">
        <Stat
          label="Connected agents"
          value={String(agents.length)}
          note={
            agents.length
              ? 'Ready to receive context'
              : 'Connect your first agent'
          }
        />
        <Stat
          label="Remembered details"
          value={String(memories.length)}
          note={
            memories.length
              ? 'With source and confidence'
              : 'Nothing learned yet'
          }
        />
        <Stat
          label="Model version"
          value={`v${profile.modelVersion ?? 1}`}
          note="Changes are versioned"
        />
        <Stat
          label="Waiting for you"
          value={String(pending.length)}
          note={
            pending.length
              ? 'Review before an agent acts'
              : 'Nothing needs your decision'
          }
          alert={pending.length > 0}
        />
      </section>
      <div className="account-two-column">
        <section className="account-panel">
          <PanelHeading eyebrow="Recent activity" title="What has changed" />
          {events.length ? (
            <div className="activity-stack">
              {events.map((event) => (
                <div className="activity-row" key={event.id}>
                  <i className="activity-dot" />
                  <div>
                    <strong>{event.eventType.replaceAll('.', ' · ')}</strong>
                    <p>{prettyDate(event.occurredAt)}</p>
                  </div>
                  <span>{display(event.payload?.action, 'Recorded')}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title="Your story starts here"
              body="When an agent uses your model, its work will appear here."
            />
          )}
        </section>
        <section className="account-panel">
          <PanelHeading
            eyebrow="Needs your attention"
            title="Human checkpoints"
            action={pending.length ? 'Open approvals' : undefined}
            onAction={() => onNavigate('Approvals')}
          />
          {pending.length ? (
            pending.slice(0, 3).map((approval) => (
              <div className="checkpoint-row" key={approval.id}>
                <span>!</span>
                <div>
                  <strong>{approval.action}</strong>
                  <p>{approval.summary}</p>
                  <small>{prettyDate(approval.createdAt)}</small>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              title="Nothing is waiting"
              body="Agents will pause here whenever your judgment is needed."
            />
          )}
        </section>
      </div>
      <section className="account-panel model-pulse-panel">
        <PanelHeading
          eyebrow="What your model knows"
          title="The signals agents can use"
          action="See the full model"
          onAction={() => onNavigate('Human model')}
        />
        <div className="pulse-list">
          <Pulse label="Voice" value={voice} />
          <Pulse
            label="Values"
            value={
              values.length
                ? values.slice(0, 3).join(' · ')
                : 'Add the principles you protect'
            }
          />
          <Pulse
            label="Current focus"
            value={
              priorities.length
                ? priorities.slice(0, 2).join(' · ')
                : 'Add what matters this season'
            }
          />
          <Pulse
            label="Boundaries"
            value={
              list(profile.boundaries?.mustAsk).length
                ? 'Ask before important commitments'
                : 'Add what should never be assumed'
            }
          />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  alert = false,
}: {
  label: string;
  value: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div className={`account-stat ${alert ? 'account-stat-alert' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="account-panel-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      {action && (
        <button className="account-text-link" onClick={onAction} type="button">
          {action} ↗
        </button>
      )}
    </div>
  );
}

function Pulse({ label, value }: { label: string; value: string }) {
  return (
    <div className="account-pulse">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <i />
    </div>
  );
}

function EmptyState({
  title,
  body,
  compact = false,
}: {
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className={`account-empty ${compact ? 'account-empty-compact' : ''}`}>
      <span>◌</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function HumanModelView({
  profile,
  setProfile,
}: {
  profile: Human;
  setProfile: (profile: Human) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [role, setRole] = useState(profile.role ?? '');
  const [voice, setVoice] = useState(
    display(profile.persona?.communicationStyle, ''),
  );
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const values = list(profile.persona?.values);
  const boundaries = list(profile.boundaries?.mustAsk);
  const principles = list(profile.behavior?.responsePrinciples);
  const priorities = profile.currentPriorities ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const updated = await request<Human>('/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          role,
          persona: { communicationStyle: voice },
        }),
      });
      setProfile(updated);
      setEditing(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save your model.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-content">
      <section className="section-intro-row">
        <div>
          <span className="eyebrow">Human model</span>
          <h2>
            The parts that make
            <br />
            <em>your way of working.</em>
          </h2>
          <p>
            This is the understanding your agents can carry into their work.
            Direct corrections always outrank old or inferred memory.
          </p>
        </div>
        <SmallButton onClick={() => setEditing((value) => !value)}>
          {editing ? 'Close editor' : 'Edit basics'}
        </SmallButton>
      </section>
      {editing && (
        <form className="account-panel model-editor" onSubmit={save}>
          <PanelHeading
            eyebrow="Your basics"
            title="Keep the starting point current"
          />
          <div className="editor-grid">
            <label>
              Name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label>
              What you do
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Founder, designer, developer…"
              />
            </label>
            <label className="editor-wide">
              How should your agent sound?
              <textarea
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
              />
            </label>
          </div>
          {errorMessage && <div className="account-error">{errorMessage}</div>}
          <SmallButton disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save changes'}
          </SmallButton>
        </form>
      )}
      <div className="model-grid">
        <ModelCard
          eyebrow="Identity"
          title="Who you are"
          values={[
            ['Name', profile.displayName],
            ['Role', profile.role],
            ['Mission', profile.identity?.mission],
            ['Current chapter', profile.biography?.currentChapter],
          ]}
        />
        <ModelCard
          eyebrow="Voice"
          title="How you sound"
          values={[
            ['Style', profile.persona?.communicationStyle],
            ['Tone', profile.persona?.tone],
            ['Directness', profile.persona?.directness],
            ['Rhythm', profile.persona?.verbosity],
          ]}
        />
        <ModelCard
          eyebrow="Values"
          title="What you protect"
          items={values}
          empty="Add values through your next conversation with an agent."
        />
        <ModelCard
          eyebrow="Boundaries"
          title="Where to pause"
          items={boundaries}
          empty="No checkpoints have been added yet."
        />
        <ModelCard
          eyebrow="Judgment"
          title="How you choose"
          values={[
            ['Risk', profile.decision?.riskTolerance],
            ['Default', profile.decision?.defaultStance],
            ['Tradeoff', profile.decision?.tradeoffs],
            ['Ask before', profile.decision?.asksBeforeCommitment],
          ]}
        />
        <ModelCard
          eyebrow="Working principles"
          title="What good looks like"
          items={principles}
          empty="Your agents will learn these from explicit feedback."
        />
      </div>
      <section className="account-panel focus-panel">
        <PanelHeading eyebrow="Right now" title="Your current focus" />
        {priorities.length ? (
          <div className="focus-list">
            {priorities.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="Nothing here yet"
            body="Add a priority when you want your agents to understand this season of your work."
          />
        )}
      </section>
    </div>
  );
}

function ModelCard({
  eyebrow,
  title,
  values,
  items,
  empty,
}: {
  eyebrow: string;
  title: string;
  values?: Array<[string, unknown]>;
  items?: string[];
  empty?: string;
}) {
  return (
    <section className="account-panel model-card">
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      {values ? (
        <dl>
          {values.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{display(value)}</dd>
            </div>
          ))}
        </dl>
      ) : items?.length ? (
        <ul className="model-items">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="model-card-empty">{empty}</p>
      )}
    </section>
  );
}

function MemoryView() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  useEffect(() => {
    request<Memory[]>('/v1/memory')
      .then(setMemories)
      .catch((error) =>
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not load memory.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(
    () =>
      memories.filter((item) =>
        `${item.kind} ${display(item.content, '')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [memories, query],
  );
  return (
    <div className="account-content">
      <section className="section-intro-row">
        <div>
          <span className="eyebrow">Memory</span>
          <h2>
            What your agents
            <br />
            <em>have learned.</em>
          </h2>
          <p>
            Every detail has a source, a confidence level, and a place in the
            story. You can correct or forget it at any time.
          </p>
        </div>
        <div className="memory-count">
          <strong>{memories.length}</strong>
          <span>remembered details</span>
        </div>
      </section>
      <section className="account-panel memory-panel">
        <div className="memory-toolbar">
          <div>
            <span className="eyebrow">Your memory</span>
            <h3>Confirmed, observed, and inferred</h3>
          </div>
          <input
            aria-label="Search memory"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search what deal knows…"
            value={query}
          />
        </div>
        {errorMessage && <div className="account-error">{errorMessage}</div>}
        {loading ? (
          <div className="loading-line">Loading your memory…</div>
        ) : filtered.length ? (
          <div className="memory-list">
            {filtered.map((memory) => (
              <article className="memory-row" key={memory.id}>
                <span className="memory-kind">{prettyKind(memory.kind)}</span>
                <div>
                  <strong>{display(memory.content)}</strong>
                  <p>
                    {memory.confirmation?.replaceAll('_', ' ') ??
                      'Source not recorded'}
                    {memory.source ? ` · ${memory.source}` : ''}
                  </p>
                </div>
                <span className="memory-date">
                  {prettyDate(memory.createdAt)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              query
                ? 'Nothing matches that search'
                : 'Your memory is still empty'
            }
            body={
              query
                ? 'Try a different word or clear the search.'
                : 'Once an agent learns something useful, it will appear here with its source and confidence.'
            }
          />
        )}
      </section>
    </div>
  );
}

function DeveloperView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [agentName, setAgentName] = useState('');
  const [runtime, setRuntime] = useState('');
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const load = () =>
    request<{ agents: Agent[] }>('/v1/agents').then((response) => {
      setAgents(response.agents);
      if (!selectedAgent && response.agents[0])
        setSelectedAgent(response.agents[0].id);
    });
  useEffect(() => {
    load().catch((error) =>
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load your connections.',
      ),
    );
  }, []);
  const activeAgent =
    agents.find((agent) => agent.id === selectedAgent) ?? agents[0];
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAgent) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await request<{ apiKey: string }>(
        `/v1/agents/${activeAgent.id}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: keyName.trim() || `${activeAgent.name} key`,
          }),
        },
      );
      setNewKey(response.apiKey);
      setKeyName('');
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not create the key.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await request<{ agent: Agent }>(`/v1/agents`, {
        method: 'POST',
        body: JSON.stringify({
          name: agentName,
          runtime: runtime || 'custom',
          createApiKey: false,
        }),
      });
      setAgentName('');
      setRuntime('');
      setShowAgentForm(false);
      await load();
      setSelectedAgent(response.agent.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not add the connection.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(agent: Agent, credentialId: string) {
    if (
      !window.confirm(
        'Revoke this key? Anything using it will stop working immediately.',
      )
    )
      return;
    setBusy(true);
    try {
      await request(`/v1/credentials/${credentialId}/revoke`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not revoke the key.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    await navigator.clipboard.writeText(newKey);
  }
  return (
    <div className="account-content">
      <section className="section-intro-row developer-intro">
        <div>
          <span className="eyebrow">Developer</span>
          <h2>
            Connect your agents
            <br />
            <em>without giving up you.</em>
          </h2>
          <p>
            Generate a private key for the agent you already use. deal gives it
            your model; it keeps its own tools and way of working.
          </p>
        </div>
        <SmallButton onClick={() => setShowAgentForm((value) => !value)}>
          {showAgentForm ? 'Close' : 'Add a connection'}
        </SmallButton>
      </section>
      {newKey && (
        <section className="new-key-card">
          <div>
            <span className="eyebrow">Copy this once</span>
            <h3>Your new developer key</h3>
            <p>
              It will never be shown again. Store it in the environment where
              your agent runs, not in a public app.
            </p>
          </div>
          <div className="new-key-value">
            <code>{newKey}</code>
            <button onClick={copy} type="button">
              Copy
            </button>
          </div>
          <button
            className="account-text-link"
            onClick={() => setNewKey('')}
            type="button"
          >
            I stored it ↗
          </button>
        </section>
      )}
      {showAgentForm && (
        <form className="account-panel developer-form" onSubmit={createAgent}>
          <PanelHeading
            eyebrow="New connection"
            title="Name the agent you want to connect"
          />
          <div className="editor-grid">
            <label>
              Name
              <input
                onChange={(event) => setAgentName(event.target.value)}
                placeholder="My research agent"
                required
                value={agentName}
              />
            </label>
            <label>
              Built with
              <input
                onChange={(event) => setRuntime(event.target.value)}
                placeholder="OpenAI, Claude, Vercel AI…"
                value={runtime}
              />
            </label>
          </div>
          <SmallButton disabled={busy} type="submit">
            {busy ? 'Adding…' : 'Add connection'}
          </SmallButton>
        </form>
      )}
      {errorMessage && <div className="account-error">{errorMessage}</div>}
      {agents.length ? (
        <>
          <section className="account-panel key-create-panel">
            <PanelHeading
              eyebrow="New developer key"
              title="Choose where this key will live"
            />
            <form className="key-create-form" onSubmit={createKey}>
              <label>
                Connection
                <select
                  onChange={(event) => setSelectedAgent(event.target.value)}
                  value={activeAgent?.id ?? ''}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Key name
                <input
                  onChange={(event) => setKeyName(event.target.value)}
                  placeholder={`${activeAgent?.name ?? 'Agent'} key`}
                  value={keyName}
                />
              </label>
              <SmallButton disabled={busy} type="submit">
                {busy ? 'Creating…' : 'Generate key'}
              </SmallButton>
            </form>
          </section>
          <section className="account-panel connection-panel">
            <PanelHeading eyebrow="Your connections" title="Agents and keys" />
            <div className="connection-list">
              {agents.map((agent) => (
                <article className="connection-row" key={agent.id}>
                  <span
                    className={`connection-status ${agent.status === 'active' ? 'connection-status-live' : ''}`}
                  />
                  <div>
                    <strong>{agent.name}</strong>
                    <p>
                      {agent.runtime || 'Custom agent'} ·{' '}
                      {
                        agent.credentials.filter(
                          (credential) => credential.active,
                        ).length
                      }{' '}
                      active key
                      {agent.credentials.filter(
                        (credential) => credential.active,
                      ).length === 1
                        ? ''
                        : 's'}
                    </p>
                  </div>
                  <span className="connection-state">
                    {agent.status === 'active' ? 'Ready' : 'Paused'}
                  </span>
                  <div className="connection-keys">
                    {agent.credentials.map((credential) => (
                      <div className="key-row" key={credential.id}>
                        <span>
                          {credential.name || 'Developer key'} ·{' '}
                          {credential.active ? 'active' : 'revoked'}
                        </span>
                        {credential.active && (
                          <button
                            className="danger-text"
                            onClick={() => revoke(agent, credential.id)}
                            type="button"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="account-panel">
          <EmptyState
            title="No connections yet"
            body="Add the agent you already use, then generate its first private key."
          />
        </section>
      )}
    </div>
  );
}

function ApprovalsView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  async function load() {
    setApprovals(await request<Approval[]>('/v1/approvals'));
  }
  useEffect(() => {
    load()
      .catch((error) =>
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not load approvals.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  async function decide(id: string, decision: 'approved' | 'denied') {
    setBusyId(id);
    setErrorMessage('');
    try {
      await request(`/v1/approvals/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not save your decision.',
      );
    } finally {
      setBusyId('');
    }
  }
  const pending = approvals.filter((approval) => approval.status === 'pending');
  return (
    <div className="account-content">
      <section className="section-intro-row">
        <div>
          <span className="eyebrow">Approvals</span>
          <h2>
            Your call, exactly
            <br />
            <em>where it matters.</em>
          </h2>
          <p>
            Agents can prepare work. They pause here when the action needs your
            explicit decision.
          </p>
        </div>
        <div className="approval-count">
          <strong>{pending.length}</strong>
          <span>waiting now</span>
        </div>
      </section>
      <section className="account-panel approval-panel">
        <PanelHeading
          eyebrow="Human checkpoints"
          title="Review before an agent acts"
        />
        {errorMessage && <div className="account-error">{errorMessage}</div>}
        {loading ? (
          <div className="loading-line">Loading approvals…</div>
        ) : pending.length ? (
          <div className="approval-list">
            {pending.map((approval) => (
              <article className="approval-card" key={approval.id}>
                <div className="approval-card-top">
                  <span className="approval-risk">
                    {approval.policyResult?.risk ?? 'Needs your decision'}
                  </span>
                  <small>{prettyDate(approval.createdAt)}</small>
                </div>
                <h3>{approval.action}</h3>
                <p>{approval.summary}</p>
                <div className="approval-meta">
                  <span>
                    Payload locked to{' '}
                    <code>{approval.payloadHash.slice(0, 12)}…</code>
                  </span>
                  <span>
                    {approval.policyResult?.reason ??
                      'The agent reached a human checkpoint.'}
                  </span>
                </div>
                <div className="approval-actions">
                  <button
                    className="approval-deny"
                    disabled={busyId === approval.id}
                    onClick={() => decide(approval.id, 'denied')}
                    type="button"
                  >
                    Deny
                  </button>
                  <button
                    className="approval-allow"
                    disabled={busyId === approval.id}
                    onClick={() => decide(approval.id, 'approved')}
                    type="button"
                  >
                    {busyId === approval.id ? 'Saving…' : 'Approve this action'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing needs your decision"
            body="When a connected agent reaches a boundary or asks for permission, its exact action will appear here."
          />
        )}
      </section>
      <section className="account-panel past-approvals">
        <PanelHeading
          eyebrow="Decision history"
          title="What you have already decided"
        />
        {approvals.filter((approval) => approval.status !== 'pending')
          .length ? (
          approvals
            .filter((approval) => approval.status !== 'pending')
            .slice(0, 8)
            .map((approval) => (
              <div className="past-approval-row" key={approval.id}>
                <span
                  className={`past-status past-status-${approval.status}`}
                />{' '}
                <strong>{approval.action}</strong>
                <span>{approval.status}</span>
                <small>{prettyDate(approval.createdAt)}</small>
              </div>
            ))
        ) : (
          <p className="muted-copy">
            Your approval history will appear after the first decision.
          </p>
        )}
      </section>
    </div>
  );
}
