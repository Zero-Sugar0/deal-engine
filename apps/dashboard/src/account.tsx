import {
  type FormEvent,
  type ReactNode,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { authClient, dealApiUrl, getDealSessionToken } from './auth-client';

type CodeToken = { content: string; color?: string };
type CodeTokenLines = CodeToken[][];
let markdownHighlighterPromise:
  | Promise<import('@shikijs/core').HighlighterGeneric<string, string>>
  | undefined;

function getMarkdownHighlighter() {
  markdownHighlighterPromise ??= Promise.all([
    import('@shikijs/core'),
    import('@shikijs/engine-javascript'),
    import('@shikijs/themes/github-dark'),
  ]).then(([core, engine, theme]) =>
    core.createHighlighterCore({
      engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
      themes: [theme.default],
      langs: [
        import('@shikijs/langs/bash').then((module) => module.default),
        import('@shikijs/langs/css').then((module) => module.default),
        import('@shikijs/langs/diff').then((module) => module.default),
        import('@shikijs/langs/html').then((module) => module.default),
        import('@shikijs/langs/javascript').then((module) => module.default),
        import('@shikijs/langs/json').then((module) => module.default),
        import('@shikijs/langs/markdown').then((module) => module.default),
        import('@shikijs/langs/python').then((module) => module.default),
        import('@shikijs/langs/sql').then((module) => module.default),
        import('@shikijs/langs/typescript').then((module) => module.default),
        import('@shikijs/langs/yaml').then((module) => module.default),
      ],
    }),
  );
  return markdownHighlighterPromise;
}

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
  judgment?: Record<string, unknown>;
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

type AiGatewaySettings = {
  configured: boolean;
  provider: 'vercel_ai_gateway';
  model?: string;
  keyHint?: string;
  createdAt?: string;
  updatedAt?: string;
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

type ComparisonResponse = {
  task: string;
  model: string;
  raw: {
    text: string;
    finishReason: string;
    usage: unknown;
  };
  humanized: {
    text: string;
    finishReason: string;
    usage: unknown;
  };
  context: {
    packetId: string;
    expiresAt: string;
    policyVersion: string;
    professionalProfile?: string;
    memoryReferences: number;
    agentId: string;
  };
};

type AiGatewayModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow?: number;
  maxTokens?: number;
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
  ['Try it', '✦'],
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
        {active === 'Try it' && <TryItView />}
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

type ImageAttachment = {
  name: string;
  mediaType: string;
  data: string;
};

function normalizeCodeLanguage(value: string): string {
  const language = value.toLowerCase();
  return (
    (
      {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        sh: 'bash',
        shell: 'bash',
        md: 'markdown',
        yml: 'yaml',
        text: 'markdown',
        txt: 'markdown',
      } as Record<string, string>
    )[language] ?? language
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [tokens, setTokens] = useState<CodeTokenLines>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getMarkdownHighlighter()
      .then((highlighter) => {
        if (!active) return;
        try {
          const loadedLanguage = normalizeCodeLanguage(language);
          const loaded = highlighter.getLoadedLanguages();
          const safeLanguage = loaded.includes(loadedLanguage as never)
            ? loadedLanguage
            : 'markdown';
          setTokens(
            highlighter.codeToTokens(code, {
              lang: safeLanguage,
              theme: 'github-dark',
            }).tokens as CodeTokenLines,
          );
        } catch {
          setTokens(undefined);
        }
      })
      .catch(() => setTokens(undefined));
    return () => {
      active = false;
    };
  }, [code, language]);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="try-code-block">
      <div className="try-code-toolbar">
        <span>{language || 'text'}</span>
        <button onClick={copyCode} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>
          {tokens
            ? tokens.map((line, lineIndex) => (
                <span className="try-code-line" key={lineIndex}>
                  {line.map((token, tokenIndex) => (
                    <span
                      key={`${lineIndex}-${tokenIndex}`}
                      style={token.color ? { color: token.color } : undefined}
                    >
                      {token.content}
                    </span>
                  ))}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}

function MarkdownCode({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const code = String(children ?? '').replace(/\n$/, '');
  const language = className?.replace(/^language-/, '') ?? '';
  if (!className) return <code className="try-inline-code">{children}</code>;
  return <CodeBlock code={code} language={language} />;
}

function TryItView() {
  const [task, setTask] = useState('');
  const [attachment, setAttachment] = useState<ImageAttachment>();
  const [runs, setRuns] = useState<ComparisonResponse[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const activeRun = runs[0];

  useEffect(() => {
    request<{ agents: Agent[] }>('/v1/agents')
      .then(({ agents: availableAgents }) => {
        const activeAgents = availableAgents.filter(
          (agent) => agent.status === 'active',
        );
        setAgents(activeAgents);
        setSelectedAgentId(activeAgents[0]?.id ?? '');
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Could not load your connected agent.',
        );
      });
  }, []);

  async function compare(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedTask = task.trim();
    if (!trimmedTask || busy) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const result = await request<ComparisonResponse>(
        '/v1/experiments/compare',
        {
          method: 'POST',
          body: JSON.stringify({
            task: trimmedTask,
            agentId: selectedAgentId || undefined,
            image: attachment
              ? {
                  name: attachment.name,
                  mediaType: attachment.mediaType,
                  data: attachment.data,
                }
              : undefined,
          }),
        },
      );
      setRuns((current) => [result, ...current].slice(0, 8));
      setTask('');
      setAttachment(undefined);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The comparison could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseImage(file?: File) {
    if (!file) return;
    const supportedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    ];
    if (!supportedTypes.includes(file.type)) {
      setErrorMessage('Choose a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5_000_000) {
      setErrorMessage('Images must be smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setAttachment({
        name: file.name,
        mediaType: file.type,
        data: reader.result,
      });
      setErrorMessage('');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="account-content try-it-content">
      <section className="try-it-intro">
        <div>
          <span className="eyebrow">A small experiment</span>
          <h2>
            See the difference
            <br />
            <em>understanding makes.</em>
          </h2>
          <p>
            Ask the same question twice: once with a plain model, and once with
            your human model guiding the answer. The difference is the point.
          </p>
        </div>
        <div className="try-it-trust-note">
          <span className="try-it-live-dot" />
          <div>
            <strong>Private by design</strong>
            <small>
              Your model stays on DEAL. Only the task reaches your model
              provider.
            </small>
          </div>
        </div>
      </section>

      <section className="try-surface">
        <div className="try-agent-bar">
          <span className="eyebrow">Testing with</span>
          <select
            aria-label="Choose an agent"
            disabled={!agents.length}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            value={selectedAgentId}
          >
            {agents.length ? (
              agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))
            ) : (
              <option value="">No connected agent yet</option>
            )}
          </select>
          <span className="try-agent-status">
            <i /> {agents.length ? 'Ready' : 'Connect one in Developer'}
          </span>
        </div>
        {!activeRun ? (
          <div className="try-empty-state">
            <div className="try-empty-mark">✦</div>
            <span className="eyebrow">Start with something real</span>
            <h3>Give your agent a moment that needs judgment.</h3>
            <p>
              Try a decision, a reply, a plan, or anything where your voice and
              priorities should change the answer.
            </p>
            <div className="try-suggestions">
              {[
                'Help me decide what to focus on this week.',
                'Draft a thoughtful reply to a difficult message.',
                'Explain this idea simply, with the tradeoffs included.',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setTask(suggestion)}
                  type="button"
                >
                  {suggestion} <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="try-results">
            <div className="try-question">
              <span className="try-question-avatar">{initials('You')}</span>
              <p>{activeRun.task}</p>
            </div>
            <div className="try-response-grid">
              <ComparisonCard
                label="Plain answer"
                description="The model on its own"
                response={activeRun.raw.text}
                tone="plain"
              />
              <ComparisonCard
                label="With your understanding"
                description="The same model with DEAL context"
                response={activeRun.humanized.text}
                tone="humanized"
                context={activeRun.context}
              />
            </div>
            <div className="try-run-meta">
              <span>Model · {activeRun.model}</span>
              <span>
                Profile ·{' '}
                {activeRun.context.professionalProfile ?? 'Generalist'}
              </span>
              <span>
                {activeRun.context.memoryReferences} memories considered
              </span>
              <span>Packet · {activeRun.context.packetId.slice(0, 12)}…</span>
            </div>
            {runs.length > 1 && (
              <div className="try-history">
                <span className="eyebrow">Earlier questions</span>
                {runs.slice(1).map((run) => (
                  <button
                    key={run.context.packetId}
                    onClick={() =>
                      setRuns((current) => [
                        run,
                        ...current.filter(
                          (item) =>
                            item.context.packetId !== run.context.packetId,
                        ),
                      ])
                    }
                    type="button"
                  >
                    {run.task}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="account-error try-error">{errorMessage}</div>
        )}
        {attachment && (
          <div className="try-attachment">
            <img src={attachment.data} alt="" />
            <span>{attachment.name}</span>
            <button
              aria-label="Remove image"
              onClick={() => setAttachment(undefined)}
              type="button"
            >
              ×
            </button>
          </div>
        )}
        <form className="try-composer" onSubmit={compare}>
          <input
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => chooseImage(event.target.files?.[0])}
            ref={fileInput}
            type="file"
          />
          <button
            aria-label="Attach an image"
            className="try-plus"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            +
          </button>
          <textarea
            aria-label="Ask your agent"
            onChange={(event) => setTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void compare();
              }
            }}
            placeholder="Ask your agent…"
            rows={2}
            value={task}
          />
          <button
            aria-label="Compare answers"
            className="try-send"
            disabled={!task.trim() || busy}
            type="submit"
          >
            {busy ? <span className="try-spinner" /> : '↑'}
          </button>
        </form>
        <small className="try-composer-note">
          Enter to compare · Shift + Enter for a new line
        </small>
      </section>
    </div>
  );
}

function ComparisonCard({
  label,
  description,
  response,
  tone,
  context,
}: {
  label: string;
  description: string;
  response: string;
  tone: 'plain' | 'humanized';
  context?: ComparisonResponse['context'];
}) {
  const [copied, setCopied] = useState(false);
  async function copyResponse() {
    await navigator.clipboard.writeText(response);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <article className={`try-response-card try-response-${tone}`}>
      <div className="try-response-heading">
        <div>
          <span className="try-response-kicker">
            <i /> {tone === 'humanized' ? 'DEAL active' : 'No context'}
          </span>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <div className="try-response-actions">
          {context && <span className="try-response-badge">Humanized</span>}
          <button onClick={copyResponse} type="button">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="try-markdown" role="document">
        <ReactMarkdown
          components={{ code: MarkdownCode }}
          remarkPlugins={[remarkGfm]}
        >
          {response}
        </ReactMarkdown>
      </div>
    </article>
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
  const [gateway, setGateway] = useState<AiGatewaySettings | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    Promise.all([
      request<{ agents: Agent[] }>('/v1/agents'),
      request<Memory[]>('/v1/memory'),
      request<Approval[]>('/v1/approvals'),
      request<AuditEvent[]>('/v1/audit'),
      request<AiGatewaySettings>('/v1/developer/ai-gateway'),
    ])
      .then(
        ([
          agentResponse,
          memoryResponse,
          approvalResponse,
          auditResponse,
          gatewayResponse,
        ]) => {
          setAgents(agentResponse.agents);
          setMemories(memoryResponse);
          setApprovals(approvalResponse);
          setEvents(auditResponse.slice(-5).reverse());
          setGateway(gatewayResponse.configured ? gatewayResponse : null);
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
  const readiness = [
    {
      label: 'Identity',
      detail: 'Who you are and what you are building',
      ready: Object.keys(profile.identity ?? {}).length > 0,
    },
    {
      label: 'Voice',
      detail: 'How your agents should sound like you',
      ready: Object.keys(profile.persona ?? {}).length > 0,
    },
    {
      label: 'Priorities',
      detail: 'What matters to you right now',
      ready: priorities.length > 0,
    },
    {
      label: 'Boundaries',
      detail: 'What agents should ask before assuming',
      ready: Object.keys(profile.boundaries ?? {}).length > 0,
    },
  ];
  const readySections = readiness.filter((item) => item.ready).length;
  const coverage = Math.round((readySections / readiness.length) * 100);
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
          label="Context coverage"
          value={`${coverage}%`}
          note={`${readySections} of ${readiness.length} foundations ready`}
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
      <section className="account-panel overview-readiness-panel">
        <PanelHeading
          eyebrow="The layer between you and AI"
          title="Your understanding, ready to travel"
          action="Edit human model"
          onAction={() => onNavigate('Human model')}
        />
        <div className="overview-readiness-grid">
          <div className="overview-coverage">
            <div className="overview-coverage-number">
              <strong>{coverage}%</strong>
              <span>context ready</span>
            </div>
            <div className="overview-progress">
              <i style={{ width: `${coverage}%` }} />
            </div>
            <p>
              Every completed section gives your agents a clearer sense of your
              voice, judgment, and limits.
            </p>
          </div>
          <div className="overview-readiness-list">
            {readiness.map((item) => (
              <div className="overview-readiness-row" key={item.label}>
                <span className={item.ready ? 'is-ready' : ''}>
                  {item.ready ? '✓' : '·'}
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="overview-route-card">
            <span className="eyebrow">Current route</span>
            <strong>{gateway?.model ?? 'No model chosen yet'}</strong>
            <p>
              {gateway
                ? 'Your comparisons use your saved Vercel AI Gateway connection.'
                : 'Choose a Vercel AI Gateway model in Developer to start comparing.'}
            </p>
            <button
              className="account-text-link"
              onClick={() => onNavigate('Developer')}
              type="button"
            >
              {gateway ? 'Change model' : 'Choose a model'} ↗
            </button>
          </div>
        </div>
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

function GatewayModelPicker({
  models,
  loading,
  errorMessage,
  value,
  onChange,
  onRetry,
}: {
  models: AiGatewayModel[];
  loading: boolean;
  errorMessage: string;
  value: string;
  onChange: (model: string) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = models.filter((model) => {
    if (!normalizedQuery) return true;
    return [model.id, model.name, model.provider].some((field) =>
      field.toLowerCase().includes(normalizedQuery),
    );
  });
  const visibleModels = filteredModels.slice(0, 48);

  return (
    <div className="gateway-model-picker">
      <div className="gateway-model-picker-heading">
        <div>
          <span className="eyebrow">Live model list</span>
          <strong>Choose what powers your comparison</strong>
        </div>
        <span className="gateway-model-count">
          {loading ? 'Loading…' : `${models.length} models`}
        </span>
      </div>
      <div className="gateway-model-search-row">
        <input
          aria-label="Search AI Gateway models"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by model or provider…"
          value={query}
        />
        {errorMessage && (
          <button onClick={onRetry} type="button">
            Try again
          </button>
        )}
      </div>
      {errorMessage ? (
        <div className="gateway-model-error">
          <span>{errorMessage}</span>
          <small>
            You can still enter an exact provider/model ID below while the list
            is unavailable.
          </small>
        </div>
      ) : loading ? (
        <div className="gateway-model-loading">Loading current models…</div>
      ) : visibleModels.length ? (
        <div
          aria-label="Available AI Gateway models"
          className="gateway-model-list"
          role="listbox"
        >
          {visibleModels.map((model) => {
            const selected = value === model.id;
            return (
              <button
                aria-selected={selected}
                className={`gateway-model-option ${selected ? 'gateway-model-option-selected' : ''}`}
                key={model.id}
                onClick={() => onChange(model.id)}
                role="option"
                type="button"
              >
                <span className="gateway-model-provider">
                  {model.provider.slice(0, 2).toUpperCase()}
                </span>
                <span className="gateway-model-option-copy">
                  <strong>{model.name}</strong>
                  <code>{model.id}</code>
                  {model.description && <small>{model.description}</small>}
                </span>
                <span className="gateway-model-check">
                  {selected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="gateway-model-empty">
          No models match “{query}”. Try a provider name or clear the search.
        </div>
      )}
      {!loading &&
        !errorMessage &&
        filteredModels.length > visibleModels.length && (
          <small className="gateway-model-more">
            Showing the first {visibleModels.length} matches. Search to narrow
            the list.
          </small>
        )}
    </div>
  );
}

type ModelSection =
  | 'identity'
  | 'persona'
  | 'selfConcept'
  | 'biography'
  | 'relational'
  | 'boundaries'
  | 'domain'
  | 'decision'
  | 'behavior'
  | 'judgment';

type ModelDraft = {
  displayName: string;
  role: string;
  identity: Record<string, unknown>;
  persona: Record<string, unknown>;
  selfConcept: Record<string, unknown>;
  biography: Record<string, unknown>;
  relationships: Array<Record<string, unknown>>;
  relational: Record<string, unknown>;
  boundaries: Record<string, unknown>;
  domain: Record<string, unknown>;
  decision: Record<string, unknown>;
  behavior: Record<string, unknown>;
  currentPriorities: string[];
  knownConstraints: string[];
  judgment: Record<string, unknown>;
};

type ObjectField = {
  key: string;
  label: string;
  kind?: 'text' | 'textarea' | 'number' | 'list' | 'select';
  options?: string[];
  placeholder?: string;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function stringLines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function modelDraft(profile: Human): ModelDraft {
  return {
    displayName: profile.displayName,
    role: profile.role ?? '',
    identity: structuredClone(recordValue(profile.identity)),
    persona: structuredClone(recordValue(profile.persona)),
    selfConcept: structuredClone(recordValue(profile.selfConcept)),
    biography: structuredClone(recordValue(profile.biography)),
    relationships: structuredClone(profile.relationships ?? []),
    relational: structuredClone(recordValue(profile.relational)),
    boundaries: structuredClone(recordValue(profile.boundaries)),
    domain: structuredClone(recordValue(profile.domain)),
    decision: structuredClone(recordValue(profile.decision)),
    behavior: structuredClone(recordValue(profile.behavior)),
    currentPriorities: [...(profile.currentPriorities ?? [])],
    knownConstraints: [...(profile.knownConstraints ?? [])],
    judgment: structuredClone(recordValue(profile.judgment)),
  };
}

function HumanModelView({
  profile,
  setProfile,
}: {
  profile: Human;
  setProfile: (profile: Human) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ModelDraft>(() => modelDraft(profile));
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const values = list(profile.persona?.values);
  const boundaries = list(profile.boundaries?.mustAsk);
  const principles = list(profile.behavior?.responsePrinciples);
  const priorities = profile.currentPriorities ?? [];

  function beginEditing() {
    setDraft(modelDraft(profile));
    setErrorMessage('');
    setEditing(true);
  }

  function updateSection(section: ModelSection, field: string, value: unknown) {
    const nextValue = value === '' ? undefined : value;
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [field]: nextValue },
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const updated = await request<Human>('/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify(draft),
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
      <section className="section-intro-row model-page-intro">
        <div>
          <span className="eyebrow">Human model</span>
          <h2>
            The parts that make
            <br />
            <em>your way of working.</em>
          </h2>
          <p>
            Shape the identity, voice, history, boundaries, and judgment your
            agents carry with them. You can change every part at any time.
          </p>
        </div>
        <div className="model-page-actions">
          {editing && (
            <span className="model-edit-status">Editing all sections</span>
          )}
          <SmallButton
            onClick={editing ? () => setEditing(false) : beginEditing}
            secondary={editing}
          >
            {editing ? 'Close editor' : 'Edit everything'}
          </SmallButton>
        </div>
      </section>
      {editing ? (
        <form className="full-model-editor" onSubmit={save}>
          <div className="editor-save-bar">
            <div>
              <span className="eyebrow">Full model editor</span>
              <strong>Make it unmistakably yours.</strong>
              <small>
                Changes are versioned and shared with future agent runs.
              </small>
            </div>
            <div className="editor-save-actions">
              <SmallButton onClick={() => setEditing(false)} secondary>
                Cancel
              </SmallButton>
              <SmallButton disabled={busy} type="submit">
                {busy ? 'Saving…' : 'Save whole model'}
              </SmallButton>
            </div>
          </div>
          {errorMessage && <div className="account-error">{errorMessage}</div>}
          <EditorSection eyebrow="Identity" title="Who you are">
            <div className="editor-grid">
              <TextField
                label="Display name"
                value={draft.displayName}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, displayName: value }))
                }
              />
              <TextField
                label="What you do"
                value={draft.role}
                placeholder="Founder, designer, researcher…"
                onChange={(value) =>
                  setDraft((current) => ({ ...current, role: value }))
                }
              />
              <TextField
                label="Preferred name"
                value={draft.identity.preferredName}
                onChange={(value) =>
                  updateSection('identity', 'preferredName', value)
                }
              />
              <TextField
                label="Pronouns"
                value={draft.identity.pronouns}
                onChange={(value) =>
                  updateSection('identity', 'pronouns', value)
                }
              />
              <TextField
                label="Organization"
                value={draft.identity.organization}
                onChange={(value) =>
                  updateSection('identity', 'organization', value)
                }
              />
              <TextField
                label="Legal name"
                value={draft.identity.legalName}
                onChange={(value) =>
                  updateSection('identity', 'legalName', value)
                }
              />
              <TextField
                label="Locale"
                value={draft.identity.locale}
                placeholder="en"
                onChange={(value) => updateSection('identity', 'locale', value)}
              />
              <TextField
                label="Timezone"
                value={draft.identity.timezone}
                placeholder="Africa/Lagos"
                onChange={(value) =>
                  updateSection('identity', 'timezone', value)
                }
              />
              <TextField
                label="Honorific"
                value={draft.identity.honorific}
                onChange={(value) =>
                  updateSection('identity', 'honorific', value)
                }
              />
              <TextField
                label="Name pronunciation"
                value={draft.identity.namePronunciation}
                onChange={(value) =>
                  updateSection('identity', 'namePronunciation', value)
                }
              />
              <TextAreaField
                className="editor-wide"
                label="Mission"
                value={draft.identity.mission}
                onChange={(value) =>
                  updateSection('identity', 'mission', value)
                }
              />
              <TextAreaField
                className="editor-wide"
                label="How you describe yourself"
                value={draft.identity.selfDescription}
                onChange={(value) =>
                  updateSection('identity', 'selfDescription', value)
                }
              />
            </div>
            <FactListEditor
              label="Languages"
              value={draft.identity.languages}
              onChange={(value) =>
                updateSection('identity', 'languages', value)
              }
            />
            <FactListEditor
              label="Identity markers"
              value={draft.identity.identityMarkers}
              onChange={(value) =>
                updateSection('identity', 'identityMarkers', value)
              }
            />
            <FactListEditor
              label="Affiliations"
              value={draft.identity.affiliations}
              onChange={(value) =>
                updateSection('identity', 'affiliations', value)
              }
            />
            <FactListEditor
              label="Accessibility needs"
              value={draft.identity.accessibilityNeeds}
              onChange={(value) =>
                updateSection('identity', 'accessibilityNeeds', value)
              }
            />
          </EditorSection>

          <EditorSection eyebrow="Voice" title="How you want to sound">
            <div className="editor-grid">
              <TextField
                label="Persona name"
                value={draft.persona.displayName}
                onChange={(value) =>
                  updateSection('persona', 'displayName', value)
                }
              />
              <TextField
                label="Persona role"
                value={draft.persona.role}
                onChange={(value) => updateSection('persona', 'role', value)}
              />
              <TextField
                label="Communication style"
                value={draft.persona.communicationStyle}
                onChange={(value) =>
                  updateSection('persona', 'communicationStyle', value)
                }
              />
              <SelectField
                label="Tone"
                value={draft.persona.tone}
                options={['warm', 'direct', 'formal', 'playful', 'calm']}
                onChange={(value) => updateSection('persona', 'tone', value)}
              />
              <SelectField
                label="Verbosity"
                value={draft.persona.verbosity}
                options={['concise', 'balanced', 'detailed']}
                onChange={(value) =>
                  updateSection('persona', 'verbosity', value)
                }
              />
              <SelectField
                label="Structure"
                value={draft.persona.structure}
                options={['conversational', 'bulleted', 'narrative', 'mixed']}
                onChange={(value) =>
                  updateSection('persona', 'structure', value)
                }
              />
              <SelectField
                label="Humor"
                value={draft.persona.humor}
                options={['none', 'light', 'playful']}
                onChange={(value) => updateSection('persona', 'humor', value)}
              />
              <SelectField
                label="Risk tolerance"
                value={draft.persona.riskTolerance}
                options={['low', 'medium', 'high']}
                onChange={(value) =>
                  updateSection('persona', 'riskTolerance', value)
                }
              />
              <SelectField
                label="Greeting"
                value={draft.persona.greetingStyle}
                options={['none', 'brief', 'personal', 'contextual']}
                onChange={(value) =>
                  updateSection('persona', 'greetingStyle', value)
                }
              />
              <SelectField
                label="Sign-off"
                value={draft.persona.signoffStyle}
                options={['none', 'brief', 'warm', 'name']}
                onChange={(value) =>
                  updateSection('persona', 'signoffStyle', value)
                }
              />
              <SelectField
                label="Sentence rhythm"
                value={draft.persona.sentenceRhythm}
                options={['crisp', 'conversational', 'reflective', 'varied']}
                onChange={(value) =>
                  updateSection('persona', 'sentenceRhythm', value)
                }
              />
              <SelectField
                label="Punctuation"
                value={draft.persona.punctuation}
                options={['minimal', 'standard', 'expressive']}
                onChange={(value) =>
                  updateSection('persona', 'punctuation', value)
                }
              />
              <SelectField
                label="Emoji policy"
                value={draft.persona.emojiPolicy}
                options={['none', 'rare', 'contextual', 'frequent']}
                onChange={(value) =>
                  updateSection('persona', 'emojiPolicy', value)
                }
              />
              <SelectField
                label="Response length"
                value={draft.persona.responseLength}
                options={['one_line', 'short', 'medium', 'long']}
                onChange={(value) =>
                  updateSection('persona', 'responseLength', value)
                }
              />
              <SelectField
                label="Lead with"
                value={draft.persona.leadWith}
                options={[
                  'answer',
                  'context',
                  'empathy',
                  'options',
                  'recommendation',
                ]}
                onChange={(value) =>
                  updateSection('persona', 'leadWith', value)
                }
              />
              <SelectField
                label="Explain with"
                value={draft.persona.explainWith}
                options={[
                  'examples',
                  'evidence',
                  'analogy',
                  'steps',
                  'tradeoffs',
                ]}
                onChange={(value) =>
                  updateSection('persona', 'explainWith', value)
                }
              />
              <SelectField
                label="Ask style"
                value={draft.persona.askStyle}
                options={[
                  'one_question_at_a_time',
                  'grouped',
                  'minimal',
                  'exploratory',
                ]}
                onChange={(value) =>
                  updateSection('persona', 'askStyle', value)
                }
              />
              <SelectField
                label="Disagreement"
                value={draft.persona.disagreementStyle}
                options={[
                  'gentle_pushback',
                  'challenge_with_reasoning',
                  'direct_pushback',
                  'defer',
                ]}
                onChange={(value) =>
                  updateSection('persona', 'disagreementStyle', value)
                }
              />
              <SelectField
                label="Empathy"
                value={draft.persona.empathyStyle}
                options={['validating', 'practical', 'warm', 'minimal']}
                onChange={(value) =>
                  updateSection('persona', 'empathyStyle', value)
                }
              />
              <TextField
                label="Working hours"
                value={draft.persona.workingHours}
                onChange={(value) =>
                  updateSection('persona', 'workingHours', value)
                }
              />
              <TextField
                label="Language"
                value={draft.persona.language}
                onChange={(value) =>
                  updateSection('persona', 'language', value)
                }
              />
              <TextField
                label="Dialect"
                value={draft.persona.dialect}
                onChange={(value) => updateSection('persona', 'dialect', value)}
              />
            </div>
            <ToggleField
              label="Use contractions"
              value={draft.persona.useContractions}
              onChange={(value) =>
                updateSection('persona', 'useContractions', value)
              }
            />
            <StringListEditor
              label="Preferred phrases"
              value={draft.persona.preferredPhrases}
              onChange={(value) =>
                updateSection('persona', 'preferredPhrases', value)
              }
            />
            <StringListEditor
              label="Phrases to avoid"
              value={draft.persona.avoidedPhrases}
              onChange={(value) =>
                updateSection('persona', 'avoidedPhrases', value)
              }
            />
            <StringListEditor
              label="Formatting preferences"
              value={draft.persona.formattingPreferences}
              onChange={(value) =>
                updateSection('persona', 'formattingPreferences', value)
              }
            />
            <StringListEditor
              label="Values in your own words"
              value={draft.persona.values}
              onChange={(value) => updateSection('persona', 'values', value)}
            />
            <ObjectListEditor
              label="Voice examples"
              value={draft.persona.examples}
              fields={[
                { key: 'situation', label: 'Situation' },
                {
                  key: 'preferredResponse',
                  label: 'Preferred response',
                  kind: 'textarea',
                },
                { key: 'why', label: 'Why it works', kind: 'textarea' },
                { key: 'channel', label: 'Channel' },
              ]}
              onChange={(value) => updateSection('persona', 'examples', value)}
            />
            <ObjectListEditor
              label="Audience modes"
              value={draft.persona.modes}
              fields={[
                { key: 'id', label: 'ID' },
                { key: 'audience', label: 'Audience' },
                { key: 'purpose', label: 'Purpose', kind: 'textarea' },
                {
                  key: 'tone',
                  label: 'Tone',
                  kind: 'select',
                  options: ['warm', 'direct', 'formal', 'playful', 'calm'],
                },
                {
                  key: 'verbosity',
                  label: 'Verbosity',
                  kind: 'select',
                  options: ['concise', 'balanced', 'detailed'],
                },
                {
                  key: 'structure',
                  label: 'Structure',
                  kind: 'select',
                  options: ['conversational', 'bulleted', 'narrative', 'mixed'],
                },
                {
                  key: 'preferredPhrases',
                  label: 'Preferred phrases',
                  kind: 'list',
                },
                {
                  key: 'avoidedPhrases',
                  label: 'Phrases to avoid',
                  kind: 'list',
                },
                {
                  key: 'formattingPreferences',
                  label: 'Formatting',
                  kind: 'list',
                },
                { key: 'notes', label: 'Notes', kind: 'list' },
              ]}
              onChange={(value) => updateSection('persona', 'modes', value)}
            />
          </EditorSection>

          <EditorSection eyebrow="Self concept" title="What matters underneath">
            <TextAreaField
              label="Summary"
              value={draft.selfConcept.summary}
              onChange={(value) =>
                updateSection('selfConcept', 'summary', value)
              }
            />
            <StringListEditor
              label="How you describe yourself"
              value={draft.selfConcept.howTheyDescribeThemselves}
              onChange={(value) =>
                updateSection('selfConcept', 'howTheyDescribeThemselves', value)
              }
            />
            {[
              ['Identity statements', 'identityStatements'],
              ['Strengths', 'strengths'],
              ['Growth edges', 'growthEdges'],
              ['Aspirations', 'aspirations'],
              ['Fears and sensitivities', 'fears'],
              ['Non-negotiables', 'nonNegotiables'],
            ].map(([label, field]) => (
              <FactListEditor
                key={field}
                label={label}
                value={draft.selfConcept[field]}
                onChange={(value) => updateSection('selfConcept', field, value)}
              />
            ))}
            <ValueListEditor
              label="Values hierarchy"
              value={draft.selfConcept.valuesHierarchy}
              onChange={(value) =>
                updateSection('selfConcept', 'valuesHierarchy', value)
              }
            />
          </EditorSection>

          <EditorSection
            eyebrow="Biography"
            title="The experience behind the decisions"
          >
            <TextAreaField
              label="Biography summary"
              value={draft.biography.summary}
              onChange={(value) => updateSection('biography', 'summary', value)}
            />
            <TextAreaField
              label="Current chapter"
              value={draft.biography.currentChapter}
              onChange={(value) =>
                updateSection('biography', 'currentChapter', value)
              }
            />
            <FactListEditor
              label="Formative experiences"
              value={draft.biography.formativeExperiences}
              onChange={(value) =>
                updateSection('biography', 'formativeExperiences', value)
              }
            />
            <ChapterListEditor
              label="Career arc"
              value={draft.biography.careerArc}
              onChange={(value) =>
                updateSection('biography', 'careerArc', value)
              }
            />
            {[
              ['Places', 'places'],
              ['Languages', 'languages'],
              ['Domain expertise', 'domainExpertise'],
              ['Life context', 'lifeContext'],
            ].map(([label, field]) => (
              <FactListEditor
                key={field}
                label={label}
                value={draft.biography[field]}
                onChange={(value) => updateSection('biography', field, value)}
              />
            ))}
          </EditorSection>

          <EditorSection
            eyebrow="Relationships"
            title="How trust changes by person and audience"
          >
            <RelationshipListEditor
              value={draft.relationships}
              onChange={(value) =>
                setDraft((current) => ({ ...current, relationships: value }))
              }
            />
          </EditorSection>

          <EditorSection
            eyebrow="Relational signals"
            title="What builds or breaks trust"
          >
            {[
              ['Trust signals', 'trustSignals'],
              ['Trust breakers', 'trustBreakers'],
              ['Calming factors', 'calmingFactors'],
              ['Frustration triggers', 'frustrationTriggers'],
              ['Sensitive topics', 'sensitiveTopics'],
              ['Emotional context notes', 'emotionalContextNotes'],
            ].map(([label, field]) => (
              <FactListEditor
                key={field}
                label={label}
                value={draft.relational[field]}
                onChange={(value) => updateSection('relational', field, value)}
              />
            ))}
            {[
              ['Acknowledgment preferences', 'acknowledgmentPreferences'],
              ['Encouragement preferences', 'encouragementPreferences'],
              ['Conflict preferences', 'conflictPreferences'],
              ['Repair protocol', 'repairProtocol'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={draft.relational[field]}
                onChange={(value) => updateSection('relational', field, value)}
              />
            ))}
          </EditorSection>

          <EditorSection
            eyebrow="Boundaries"
            title="What your agents must protect"
          >
            {[
              ['Never assume', 'neverAssume'],
              ['Must ask first', 'mustAsk'],
              ['Never mention', 'neverMention'],
              ['Never infer', 'neverInfer'],
              ['Sensitive topics', 'sensitiveTopics'],
              ['Consent rules', 'consentRules'],
              ['Protected attributes', 'protectedAttributes'],
              ['Privacy preferences', 'privacyPreferences'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={draft.boundaries[field]}
                onChange={(value) => updateSection('boundaries', field, value)}
              />
            ))}
          </EditorSection>

          <EditorSection
            eyebrow="Decisions"
            title="How you choose and weigh tradeoffs"
          >
            <div className="editor-grid">
              <SelectField
                label="Risk tolerance"
                value={draft.decision.riskTolerance}
                options={['low', 'medium', 'high']}
                onChange={(value) =>
                  updateSection('decision', 'riskTolerance', value)
                }
              />
              <SelectField
                label="Reversibility"
                value={draft.decision.reversibilityPreference}
                options={['reversible_first', 'balanced', 'decisive']}
                onChange={(value) =>
                  updateSection('decision', 'reversibilityPreference', value)
                }
              />
              <SelectField
                label="Time horizon"
                value={draft.decision.timeHorizon}
                options={[
                  'immediate',
                  'quarter',
                  'annual',
                  'multi_year',
                  'mixed',
                ]}
                onChange={(value) =>
                  updateSection('decision', 'timeHorizon', value)
                }
              />
              <SelectField
                label="Default stance"
                value={draft.decision.defaultStance}
                options={[
                  'curious',
                  'cautious',
                  'decisive',
                  'patient',
                  'experimental',
                ]}
                onChange={(value) =>
                  updateSection('decision', 'defaultStance', value)
                }
              />
              <NumberField
                label="Confidence floor"
                value={draft.decision.confidenceFloor}
                onChange={(value) =>
                  updateSection('decision', 'confidenceFloor', value)
                }
              />
              <NumberField
                label="Evidence threshold"
                value={draft.decision.evidenceThreshold}
                onChange={(value) =>
                  updateSection('decision', 'evidenceThreshold', value)
                }
              />
            </div>
            {[
              ['Priorities', 'priorities'],
              ['Tradeoffs', 'tradeoffs'],
              ['Ask before commitment', 'asksBeforeCommitment'],
              ['North stars', 'northStars'],
              ['Decision process', 'decisionProcess'],
              ['Autonomy preferences', 'autonomyPreferences'],
              ['Escalation triggers', 'escalationTriggers'],
              ['Red lines', 'redLines'],
              ['Heuristics', 'heuristics'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={draft.decision[field]}
                onChange={(value) => updateSection('decision', field, value)}
              />
            ))}
            <ObjectListEditor
              label="Decision examples"
              value={draft.decision.examples}
              fields={[
                { key: 'situation', label: 'Situation', kind: 'textarea' },
                { key: 'decision', label: 'Decision', kind: 'textarea' },
                { key: 'reasoning', label: 'Reasoning', kind: 'textarea' },
                { key: 'outcome', label: 'Outcome', kind: 'textarea' },
                { key: 'lesson', label: 'Lesson', kind: 'textarea' },
              ]}
              onChange={(value) => updateSection('decision', 'examples', value)}
            />
          </EditorSection>

          <EditorSection eyebrow="Behavior" title="How your agent should act">
            <div className="editor-grid">
              <SelectField
                label="Relationship"
                value={draft.behavior.relationship}
                options={['assistant', 'advisor', 'delegate', 'representative']}
                onChange={(value) =>
                  updateSection('behavior', 'relationship', value)
                }
              />
              <SelectField
                label="Speak as"
                value={draft.behavior.speakAs}
                options={['agent', 'representative', 'collaborator']}
                onChange={(value) =>
                  updateSection('behavior', 'speakAs', value)
                }
              />
              <SelectField
                label="When uncertain"
                value={draft.behavior.whenUncertain}
                options={['ask', 'state_uncertainty', 'offer_options']}
                onChange={(value) =>
                  updateSection('behavior', 'whenUncertain', value)
                }
              />
              <SelectField
                label="When disagreeing"
                value={draft.behavior.whenDisagreeing}
                options={[
                  'challenge_respectfully',
                  'surface_tradeoff',
                  'defer',
                ]}
                onChange={(value) =>
                  updateSection('behavior', 'whenDisagreeing', value)
                }
              />
              <SelectField
                label="When wrong"
                value={draft.behavior.whenWrong}
                options={[
                  'admit_and_correct',
                  'explain_correction',
                  'brief_apology',
                ]}
                onChange={(value) =>
                  updateSection('behavior', 'whenWrong', value)
                }
              />
              <SelectField
                label="Refusal style"
                value={draft.behavior.refusalStyle}
                options={[
                  'brief_and_firm',
                  'explain_boundary',
                  'offer_safe_alternative',
                ]}
                onChange={(value) =>
                  updateSection('behavior', 'refusalStyle', value)
                }
              />
            </div>
            <ToggleField
              label="Disclose that the agent is an AI"
              value={draft.behavior.discloseAgentIdentity}
              onChange={(value) =>
                updateSection('behavior', 'discloseAgentIdentity', value)
              }
            />
            <ToggleField
              label="Preserve my human voice"
              value={draft.behavior.preserveHumanVoice}
              onChange={(value) =>
                updateSection('behavior', 'preserveHumanVoice', value)
              }
            />
            <ToggleField
              label="Never impersonate me"
              value={draft.behavior.neverImpersonate}
              onChange={(value) =>
                updateSection('behavior', 'neverImpersonate', value)
              }
            />
            {[
              ['Ask before', 'askBefore'],
              ['Never claim', 'neverClaim'],
              ['Never do', 'neverDo'],
              ['Response principles', 'responsePrinciples'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={draft.behavior[field]}
                onChange={(value) => updateSection('behavior', field, value)}
              />
            ))}
          </EditorSection>

          <EditorSection
            eyebrow="Work and domain"
            title="The world your agent is operating in"
          >
            <div className="editor-grid">
              {[
                ['Business', 'business'],
                ['Ideal customer', 'icp'],
                ['Offer', 'offer'],
                ['Industry', 'industry'],
                ['Specialization', 'specialization'],
                ['Seniority', 'seniority'],
                ['Profession profile', 'profession'],
              ].map(([label, field]) => (
                <TextField
                  key={field}
                  label={label}
                  value={draft.domain[field]}
                  onChange={(value) => updateSection('domain', field, value)}
                />
              ))}
            </div>
            {[
              ['Jurisdictions', 'jurisdictions'],
              ['Exclusions', 'exclusions'],
              ['Goals', 'goals'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={draft.domain[field]}
                onChange={(value) => updateSection('domain', field, value)}
              />
            ))}
            <TerminologyEditor
              value={draft.domain.terminology}
              onChange={(value) =>
                updateSection('domain', 'terminology', value)
              }
            />
          </EditorSection>

          <EditorSection
            eyebrow="Current direction"
            title="What matters in this season"
          >
            <StringListEditor
              label="Current priorities"
              value={draft.currentPriorities}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  currentPriorities: value,
                }))
              }
            />
            <StringListEditor
              label="Known constraints"
              value={draft.knownConstraints}
              onChange={(value) =>
                setDraft((current) => ({ ...current, knownConstraints: value }))
              }
            />
          </EditorSection>

          <EditorSection
            eyebrow="Judgment"
            title="Where your agent should pause"
          >
            <StringListEditor
              label="Ask if missing"
              value={draft.judgment.askIfMissing}
              onChange={(value) =>
                updateSection('judgment', 'askIfMissing', value)
              }
            />
            <StringListEditor
              label="Escalate if"
              value={draft.judgment.escalateIf}
              onChange={(value) =>
                updateSection('judgment', 'escalateIf', value)
              }
            />
            <StringListEditor
              label="Refuse if"
              value={draft.judgment.refuseIf}
              onChange={(value) => updateSection('judgment', 'refuseIf', value)}
            />
            <NumberField
              label="Confidence threshold"
              value={draft.judgment.confidenceThreshold}
              onChange={(value) =>
                updateSection('judgment', 'confidenceThreshold', value)
              }
            />
          </EditorSection>
          <div className="editor-bottom-save">
            <SmallButton disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save whole model'}
            </SmallButton>
          </div>
        </form>
      ) : (
        <>
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
              empty="Add values through the full model editor."
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
        </>
      )}
    </div>
  );
}

function EditorSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="editor-section">
      <div className="editor-section-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <div className="editor-section-content">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={
          typeof value === 'string' ? value : value == null ? '' : String(value)
        }
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`editor-field ${className}`}>
      <span>{label}</span>
      <textarea
        onChange={(event) => onChange(event.target.value)}
        value={
          typeof value === 'string' ? value : value == null ? '' : String(value)
        }
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: unknown;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === 'string' ? value : ''}
      >
        <option value="">Not set</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : undefined)
        }
        step={step}
        type="number"
        value={typeof value === 'number' ? value : ''}
      />
    </label>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="editor-toggle">
      <input
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
      <i />
    </label>
  );
}

function StringListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="editor-list-field">
      <span>{label}</span>
      <textarea
        onChange={(event) =>
          onChange(
            event.target.value
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        placeholder="One item per line"
        value={stringLines(value).join('\n')}
      />
    </label>
  );
}

function FactListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const facts = recordList(value);
  function update(index: number, field: string, fieldValue: unknown) {
    onChange(
      facts.map((fact, currentIndex) =>
        currentIndex === index ? { ...fact, [field]: fieldValue } : fact,
      ),
    );
  }
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>{label}</span>
        <button
          onClick={() =>
            onChange([
              ...facts,
              {
                value: '',
                confidence: 1,
                confirmation: 'user_confirmed',
                sensitivity: 'normal',
                tags: [],
              },
            ])
          }
          type="button"
        >
          + Add detail
        </button>
      </div>
      {facts.map((fact, index) => (
        <div className="fact-editor-card" key={String(fact.id ?? index)}>
          <div className="fact-editor-topline">
            <strong>Detail {index + 1}</strong>
            <button
              aria-label={`Remove ${label} detail ${index + 1}`}
              onClick={() =>
                onChange(facts.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
          <TextAreaField
            label="What should be remembered"
            value={fact.value}
            onChange={(fieldValue) => update(index, 'value', fieldValue)}
          />
          <div className="editor-grid editor-grid-tight">
            <TextField
              label="Category"
              value={fact.category}
              onChange={(fieldValue) => update(index, 'category', fieldValue)}
            />
            <TextField
              label="Source"
              value={fact.source}
              onChange={(fieldValue) => update(index, 'source', fieldValue)}
            />
            <NumberField
              label="Confidence"
              value={fact.confidence}
              onChange={(fieldValue) => update(index, 'confidence', fieldValue)}
            />
            <SelectField
              label="Confirmed as"
              value={fact.confirmation}
              options={['user_confirmed', 'agent_observed', 'inferred']}
              onChange={(fieldValue) =>
                update(index, 'confirmation', fieldValue)
              }
            />
            <SelectField
              label="Sensitivity"
              value={fact.sensitivity}
              options={['normal', 'personal', 'sensitive']}
              onChange={(fieldValue) =>
                update(index, 'sensitivity', fieldValue)
              }
            />
            <TextField
              label="Tags, comma separated"
              value={stringLines(fact.tags).join(', ')}
              onChange={(fieldValue) =>
                update(
                  index,
                  'tags',
                  fieldValue
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
            <TextField
              label="Valid until (optional)"
              value={fact.validUntil}
              onChange={(fieldValue) => update(index, 'validUntil', fieldValue)}
            />
          </div>
        </div>
      ))}
      {!facts.length && (
        <p className="editor-collection-empty">Nothing added yet.</p>
      )}
    </div>
  );
}

function ValueListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const values = recordList(value);
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>{label}</span>
        <button
          onClick={() => onChange([...values, { value: '', priority: 50 }])}
          type="button"
        >
          + Add value
        </button>
      </div>
      {values.map((item, index) => (
        <div
          className="structured-editor-card"
          key={String(item.value ?? index)}
        >
          <div className="editor-card-actions">
            <strong>Value {index + 1}</strong>
            <button
              onClick={() =>
                onChange(values.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
          <div className="editor-grid editor-grid-tight">
            <TextField
              label="Value"
              value={item.value}
              onChange={(fieldValue) =>
                onChange(
                  values.map((current, itemIndex) =>
                    itemIndex === index
                      ? { ...current, value: fieldValue }
                      : current,
                  ),
                )
              }
            />
            <NumberField
              label="Priority"
              value={item.priority}
              max={100}
              step={1}
              onChange={(fieldValue) =>
                onChange(
                  values.map((current, itemIndex) =>
                    itemIndex === index
                      ? { ...current, priority: fieldValue }
                      : current,
                  ),
                )
              }
            />
            <TextAreaField
              className="editor-wide"
              label="What it means"
              value={item.meaning}
              onChange={(fieldValue) =>
                onChange(
                  values.map((current, itemIndex) =>
                    itemIndex === index
                      ? { ...current, meaning: fieldValue }
                      : current,
                  ),
                )
              }
            />
            <TextAreaField
              className="editor-wide"
              label="Tradeoff"
              value={item.tradeoff}
              onChange={(fieldValue) =>
                onChange(
                  values.map((current, itemIndex) =>
                    itemIndex === index
                      ? { ...current, tradeoff: fieldValue }
                      : current,
                  ),
                )
              }
            />
          </div>
        </div>
      ))}
      {!values.length && (
        <p className="editor-collection-empty">Nothing added yet.</p>
      )}
    </div>
  );
}

function ChapterListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const chapters = recordList(value);
  const update = (index: number, field: string, fieldValue: unknown) =>
    onChange(
      chapters.map((chapter, chapterIndex) =>
        chapterIndex === index ? { ...chapter, [field]: fieldValue } : chapter,
      ),
    );
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>{label}</span>
        <button
          onClick={() =>
            onChange([
              ...chapters,
              {
                title: '',
                summary: '',
                lessons: [],
                confidence: 1,
                confirmation: 'user_confirmed',
              },
            ])
          }
          type="button"
        >
          + Add chapter
        </button>
      </div>
      {chapters.map((chapter, index) => (
        <div
          className="structured-editor-card"
          key={String(chapter.title ?? index)}
        >
          <div className="editor-card-actions">
            <strong>Chapter {index + 1}</strong>
            <button
              onClick={() =>
                onChange(chapters.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
          <div className="editor-grid editor-grid-tight">
            <TextField
              label="Title"
              value={chapter.title}
              onChange={(value) => update(index, 'title', value)}
            />
            <TextField
              label="Period"
              value={chapter.period}
              onChange={(value) => update(index, 'period', value)}
            />
            <TextAreaField
              className="editor-wide"
              label="Summary"
              value={chapter.summary}
              onChange={(value) => update(index, 'summary', value)}
            />
            <StringListEditor
              label="Lessons"
              value={chapter.lessons}
              onChange={(value) => update(index, 'lessons', value)}
            />
            <TextField
              label="Source"
              value={chapter.source}
              onChange={(value) => update(index, 'source', value)}
            />
            <NumberField
              label="Confidence"
              value={chapter.confidence}
              onChange={(value) => update(index, 'confidence', value)}
            />
            <SelectField
              label="Confirmed as"
              value={chapter.confirmation}
              options={['user_confirmed', 'agent_observed', 'inferred']}
              onChange={(value) => update(index, 'confirmation', value)}
            />
          </div>
        </div>
      ))}
      {!chapters.length && (
        <p className="editor-collection-empty">Nothing added yet.</p>
      )}
    </div>
  );
}

function RelationshipListEditor({
  value,
  onChange,
}: {
  value: Array<Record<string, unknown>>;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const update = (index: number, field: string, fieldValue: unknown) =>
    onChange(
      value.map((relationship, relationshipIndex) =>
        relationshipIndex === index
          ? { ...relationship, [field]: fieldValue }
          : relationship,
      ),
    );
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>People, groups, and audiences</span>
        <button
          onClick={() =>
            onChange([
              ...value,
              {
                id: `relationship_${Date.now()}`,
                label: '',
                goals: [],
                sensitivities: [],
                communicationPreferences: [],
                boundaries: [],
                aliases: [],
                sensitivity: 'normal',
                confirmation: 'user_confirmed',
                confidence: 1,
              },
            ])
          }
          type="button"
        >
          + Add relationship
        </button>
      </div>
      {value.map((relationship, index) => (
        <div
          className="structured-editor-card"
          key={String(relationship.id ?? index)}
        >
          <div className="editor-card-actions">
            <strong>
              {String(relationship.label || `Relationship ${index + 1}`)}
            </strong>
            <button
              onClick={() =>
                onChange(value.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
          <div className="editor-grid editor-grid-tight">
            <TextField
              label="Label"
              value={relationship.label}
              onChange={(fieldValue) => update(index, 'label', fieldValue)}
            />
            <TextField
              label="Role"
              value={relationship.role}
              onChange={(fieldValue) => update(index, 'role', fieldValue)}
            />
            <TextField
              label="Audience"
              value={relationship.audience}
              onChange={(fieldValue) => update(index, 'audience', fieldValue)}
            />
            <TextField
              label="Preferred cadence"
              value={relationship.preferredCadence}
              onChange={(fieldValue) =>
                update(index, 'preferredCadence', fieldValue)
              }
            />
            <SelectField
              label="Trust level"
              value={relationship.trustLevel}
              options={['new', 'developing', 'trusted', 'strained']}
              onChange={(fieldValue) => update(index, 'trustLevel', fieldValue)}
            />
            <SelectField
              label="Sensitivity"
              value={relationship.sensitivity}
              options={['normal', 'personal', 'sensitive']}
              onChange={(fieldValue) =>
                update(index, 'sensitivity', fieldValue)
              }
            />
            <SelectField
              label="Confirmed as"
              value={relationship.confirmation}
              options={['user_confirmed', 'agent_observed', 'inferred']}
              onChange={(fieldValue) =>
                update(index, 'confirmation', fieldValue)
              }
            />
            <NumberField
              label="Confidence"
              value={relationship.confidence}
              onChange={(fieldValue) => update(index, 'confidence', fieldValue)}
            />
            <TextAreaField
              className="editor-wide"
              label="Context"
              value={relationship.context}
              onChange={(fieldValue) => update(index, 'context', fieldValue)}
            />
            {[
              ['Goals', 'goals'],
              ['Sensitivities', 'sensitivities'],
              ['Communication preferences', 'communicationPreferences'],
              ['Boundaries', 'boundaries'],
              ['Aliases', 'aliases'],
            ].map(([label, field]) => (
              <StringListEditor
                key={field}
                label={label}
                value={relationship[field]}
                onChange={(fieldValue) => update(index, field, fieldValue)}
              />
            ))}
          </div>
        </div>
      ))}
      {!value.length && (
        <p className="editor-collection-empty">
          No relationship context added yet.
        </p>
      )}
    </div>
  );
}

function ObjectListEditor({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: unknown;
  fields: ObjectField[];
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const items = recordList(value);
  const update = (index: number, field: ObjectField, fieldValue: string) => {
    const parsed: unknown =
      field.kind === 'number'
        ? fieldValue
          ? Number(fieldValue)
          : undefined
        : field.kind === 'list'
          ? fieldValue
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)
          : field.kind === 'select' && fieldValue === ''
            ? undefined
            : fieldValue;
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field.key]: parsed } : item,
      ),
    );
  };
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>{label}</span>
        <button
          onClick={() =>
            onChange([
              ...items,
              Object.fromEntries(
                fields.map((field) => [
                  field.key,
                  field.key === 'id'
                    ? `${label.toLowerCase().replaceAll(' ', '_')}_${Date.now()}`
                    : field.kind === 'list'
                      ? []
                      : '',
                ]),
              ),
            ])
          }
          type="button"
        >
          + Add item
        </button>
      </div>
      {items.map((item, index) => (
        <div className="structured-editor-card" key={String(item.id ?? index)}>
          <div className="editor-card-actions">
            <strong>
              {label} {index + 1}
            </strong>
            <button
              onClick={() =>
                onChange(items.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
          <div className="editor-grid editor-grid-tight">
            {fields.map((field) => {
              const rawValue =
                field.kind === 'list'
                  ? stringLines(item[field.key]).join('\n')
                  : item[field.key];
              if (field.kind === 'textarea' || field.kind === 'list')
                return (
                  <TextAreaField
                    key={field.key}
                    className={field.kind === 'list' ? '' : 'editor-wide'}
                    label={field.label}
                    value={rawValue}
                    onChange={(fieldValue) => update(index, field, fieldValue)}
                  />
                );
              if (field.kind === 'select')
                return (
                  <SelectField
                    key={field.key}
                    label={field.label}
                    value={rawValue}
                    options={field.options ?? []}
                    onChange={(fieldValue) => update(index, field, fieldValue)}
                  />
                );
              if (field.kind === 'number')
                return (
                  <NumberField
                    key={field.key}
                    label={field.label}
                    value={rawValue}
                    onChange={(fieldValue) =>
                      update(
                        index,
                        field,
                        fieldValue === undefined ? '' : String(fieldValue),
                      )
                    }
                  />
                );
              return (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={rawValue}
                  placeholder={field.placeholder}
                  onChange={(fieldValue) => update(index, field, fieldValue)}
                />
              );
            })}
          </div>
        </div>
      ))}
      {!items.length && (
        <p className="editor-collection-empty">Nothing added yet.</p>
      )}
    </div>
  );
}

function TerminologyEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: Record<string, string>) => void;
}) {
  const terminology = recordValue(value);
  const entries = Object.entries(terminology).filter(
    ([key, entry]) => key && typeof entry === 'string',
  ) as Array<[string, string]>;
  return (
    <div className="editor-collection">
      <div className="editor-collection-heading">
        <span>Preferred terminology</span>
        <button
          onClick={() =>
            onChange({ ...terminology, [`term_${Date.now()}`]: '' })
          }
          type="button"
        >
          + Add term
        </button>
      </div>
      {entries.map(([key, entry], index) => (
        <div className="terminology-row" key={`${key}-${index}`}>
          <input
            aria-label="Term"
            onChange={(event) => {
              const next = { ...terminology };
              delete next[key];
              next[event.target.value] = entry;
              onChange(next as Record<string, string>);
            }}
            placeholder="Term"
            value={key}
          />
          <input
            aria-label="Preferred wording"
            onChange={(event) =>
              onChange({ ...terminology, [key]: event.target.value })
            }
            placeholder="Preferred wording"
            value={entry}
          />
          <button
            aria-label={`Remove ${key}`}
            onClick={() => {
              const next = { ...terminology };
              delete next[key];
              onChange(next as Record<string, string>);
            }}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
      {!entries.length && (
        <p className="editor-collection-empty">
          No terminology preferences added yet.
        </p>
      )}
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
  const [developerTab, setDeveloperTab] = useState<'deal' | 'byok'>('deal');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [agentName, setAgentName] = useState('');
  const [runtime, setRuntime] = useState('');
  const [gateway, setGateway] = useState<AiGatewaySettings | null>(null);
  const [gatewayModels, setGatewayModels] = useState<AiGatewayModel[]>([]);
  const [gatewayApiKey, setGatewayApiKey] = useState('');
  const [gatewayModel, setGatewayModel] = useState('');
  const [gatewayEditing, setGatewayEditing] = useState(false);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(true);
  const [gatewayModelsLoading, setGatewayModelsLoading] = useState(true);
  const [gatewayModelsError, setGatewayModelsError] = useState('');
  const [gatewayMessage, setGatewayMessage] = useState('');
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const load = () =>
    request<{ agents: Agent[] }>('/v1/agents').then((response) => {
      setAgents(response.agents);
      if (!selectedAgent && response.agents[0])
        setSelectedAgent(response.agents[0].id);
    });
  const loadGateway = () =>
    request<AiGatewaySettings>('/v1/developer/ai-gateway').then((response) => {
      setGateway(response.configured ? response : null);
      if (response.configured && response.model)
        setGatewayModel(response.model);
    });
  async function loadGatewayModels() {
    setGatewayModelsLoading(true);
    setGatewayModelsError('');
    try {
      const response = await request<{ models: AiGatewayModel[] }>(
        '/v1/developer/ai-gateway/models',
      );
      setGatewayModels(response.models);
    } catch (error) {
      setGatewayModelsError(
        error instanceof Error
          ? error.message
          : 'The model list could not be loaded.',
      );
    } finally {
      setGatewayModelsLoading(false);
    }
  }
  useEffect(() => {
    Promise.all([load(), loadGateway()])
      .catch((error) =>
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Could not load your developer settings.',
        ),
      )
      .finally(() => setGatewayLoading(false));
    void loadGatewayModels();
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
  async function saveGateway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGatewayBusy(true);
    setGatewayMessage('');
    setErrorMessage('');
    try {
      const response = await request<AiGatewaySettings>(
        '/v1/developer/ai-gateway',
        {
          method: 'PUT',
          body: JSON.stringify({
            apiKey: gatewayApiKey,
            model: gatewayModel.trim(),
          }),
        },
      );
      setGateway(response);
      setGatewayApiKey('');
      setGatewayEditing(false);
      setGatewayMessage('Saved securely. Your key will not be shown again.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save your key.',
      );
    } finally {
      setGatewayBusy(false);
    }
  }
  async function saveGatewayModel() {
    if (!gatewayModel.trim() || !gateway || gatewayModel === gateway.model)
      return;
    setGatewayBusy(true);
    setGatewayMessage('');
    setErrorMessage('');
    try {
      const response = await request<AiGatewaySettings>(
        '/v1/developer/ai-gateway',
        {
          method: 'PATCH',
          body: JSON.stringify({ model: gatewayModel.trim() }),
        },
      );
      setGateway(response);
      setGatewayMessage('Your model choice was updated.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not change the model.',
      );
    } finally {
      setGatewayBusy(false);
    }
  }
  async function removeGateway() {
    if (
      !window.confirm(
        'Remove this AI Gateway key? Dashboard comparisons will use the server default, if one is configured.',
      )
    )
      return;
    setGatewayBusy(true);
    setErrorMessage('');
    try {
      await request('/v1/developer/ai-gateway', { method: 'DELETE' });
      setGateway(null);
      setGatewayApiKey('');
      setGatewayModel('');
      setGatewayEditing(false);
      setGatewayMessage('Your saved key was removed.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not remove your key.',
      );
    } finally {
      setGatewayBusy(false);
    }
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
      <div
        className="developer-tabs"
        role="tablist"
        aria-label="Developer keys"
      >
        <button
          className={developerTab === 'deal' ? 'developer-tab-active' : ''}
          onClick={() => setDeveloperTab('deal')}
          role="tab"
          aria-selected={developerTab === 'deal'}
          type="button"
        >
          deal API keys
          <small>Connect an agent</small>
        </button>
        <button
          className={developerTab === 'byok' ? 'developer-tab-active' : ''}
          onClick={() => setDeveloperTab('byok')}
          role="tab"
          aria-selected={developerTab === 'byok'}
          type="button"
        >
          bring your own key
          <small>Use your AI Gateway</small>
        </button>
      </div>
      {developerTab === 'byok' ? (
        <section className="account-panel gateway-panel">
          <PanelHeading
            eyebrow="Your AI Gateway"
            title="Choose the model behind your comparisons"
          />
          <p className="gateway-copy">
            Add your Vercel AI Gateway key once. deal encrypts it on the server,
            keeps it masked, and uses it only for your dashboard tests.
          </p>
          {gatewayLoading ? (
            <div className="loading-line">Checking your saved key…</div>
          ) : gateway && !gatewayEditing ? (
            <>
              <div className="gateway-saved-card">
                <div>
                  <span className="gateway-status-dot" />
                  <strong>Connected to Vercel AI Gateway</strong>
                  <p>{gateway.keyHint}</p>
                  <small>
                    Added {prettyDate(gateway.createdAt)} · encrypted and never
                    displayed in full
                  </small>
                </div>
                <div className="gateway-actions">
                  <SmallButton
                    onClick={() => {
                      setGatewayModel(gateway.model ?? '');
                      setGatewayEditing(true);
                      setGatewayMessage('');
                    }}
                    secondary
                  >
                    Replace key
                  </SmallButton>
                  <button
                    className="danger-text"
                    disabled={gatewayBusy}
                    onClick={removeGateway}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <GatewayModelPicker
                errorMessage={gatewayModelsError}
                loading={gatewayModelsLoading}
                models={gatewayModels}
                onChange={setGatewayModel}
                onRetry={() => void loadGatewayModels()}
                value={gatewayModel}
              />
              <div className="gateway-selected-model">
                <label>
                  Selected model
                  <input
                    onChange={(event) => setGatewayModel(event.target.value)}
                    placeholder="provider/model-id"
                    value={gatewayModel}
                  />
                </label>
                <SmallButton
                  disabled={gatewayBusy || gatewayModel === gateway.model}
                  onClick={() => void saveGatewayModel()}
                >
                  {gatewayBusy ? 'Saving…' : 'Save model'}
                </SmallButton>
              </div>
            </>
          ) : (
            <form className="gateway-form" onSubmit={saveGateway}>
              <label>
                AI Gateway API key
                <input
                  autoComplete="off"
                  onChange={(event) => setGatewayApiKey(event.target.value)}
                  placeholder="Paste your key"
                  required
                  type="password"
                  value={gatewayApiKey}
                />
                <small>
                  It is sent over HTTPS and never shown after saving.
                </small>
              </label>
              <GatewayModelPicker
                errorMessage={gatewayModelsError}
                loading={gatewayModelsLoading}
                models={gatewayModels}
                onChange={setGatewayModel}
                onRetry={() => void loadGatewayModels()}
                value={gatewayModel}
              />
              <label className="gateway-exact-model">
                Model ID
                <input
                  onChange={(event) => setGatewayModel(event.target.value)}
                  placeholder="provider/model-id"
                  required
                  value={gatewayModel}
                />
                <small>Use this when you already know an exact model ID.</small>
              </label>
              <div className="gateway-form-actions">
                <SmallButton disabled={gatewayBusy} type="submit">
                  {gatewayBusy
                    ? 'Saving…'
                    : gateway
                      ? 'Save replacement'
                      : 'Save key'}
                </SmallButton>
                {gateway && (
                  <SmallButton
                    onClick={() => {
                      setGatewayEditing(false);
                      setGatewayApiKey('');
                      setGatewayMessage('');
                    }}
                    secondary
                  >
                    Cancel
                  </SmallButton>
                )}
              </div>
            </form>
          )}
          {gatewayMessage && (
            <p className="gateway-success">{gatewayMessage}</p>
          )}
        </section>
      ) : agents.length ? (
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
