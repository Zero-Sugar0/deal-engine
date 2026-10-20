import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono.js';
import Claude from '@lobehub/icons/es/Claude/components/Mono.js';
import LangChain from '@lobehub/icons/es/LangChain/components/Mono.js';
import Vercel from '@lobehub/icons/es/Vercel/components/Mono.js';
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono.js';
import Codex from '@lobehub/icons/es/Codex/components/Mono.js';
import Cursor from '@lobehub/icons/es/Cursor/components/Mono.js';
import './styles.css';
import './refinements.css';

type Route = '/' | '/about' | '/sign-in' | '/sign-up' | '/app';

const integrations = [
  'OpenAI',
  'Claude',
  'LangChain',
  'Vercel AI',
  'OpenRouter',
  'Codex',
  'Cursor',
];

function BrandIcon({ name, size = 19 }: { name: string; size?: number }) {
  const Icon = name.startsWith('Claude')
    ? Claude
    : name.startsWith('LangChain')
      ? LangChain
      : name.startsWith('Vercel')
        ? Vercel
        : name.startsWith('OpenRouter')
          ? OpenRouter
          : name === 'Codex'
            ? Codex
            : name === 'Cursor'
              ? Cursor
              : name.startsWith('OpenAI') ||
                  name === 'Responses API' ||
                  name === 'Chat Completions'
                ? OpenAI
                : undefined;
  return Icon ? <Icon size={size} aria-hidden="true" /> : null;
}

const sessions = [
  {
    status: 'Aligned',
    color: 'green',
    title: 'Reply to the partner',
    body: 'Used your direct voice, kept the commitment reversible, and surfaced one ambiguity.',
  },
  {
    status: 'Learning',
    color: 'amber',
    title: 'Review the new context',
    body: 'A new preference was detected. You decide whether it becomes part of the human model.',
  },
  {
    status: 'Protected',
    color: 'blue',
    title: 'Pause before sending',
    body: 'The action crossed a boundary, so your agent asked before it acted.',
  },
];

const features = [
  [
    'lilac',
    'human model',
    'A living identity for every agent',
    'Your values, voice, history, relationships, and current season stay coherent across every agent you use.',
    'identity',
  ],
  [
    'blush',
    'conversation',
    'Context that arrives at the right moment',
    'deal compiles only what matters for the current task, audience, and conversation.',
    'context',
  ],
  [
    'blue',
    'judgment',
    'More than preferences',
    'Give your agents the reasoning patterns behind your choices, not just a list of instructions.',
    'judgment',
  ],
  [
    'blue',
    'memory',
    'Memory with provenance',
    'Every remembered detail carries confidence, source, correction history, and a clear place in your model.',
    'memory',
  ],
  [
    'lilac',
    'boundaries',
    'A boundary before a bad decision',
    'Your agent knows when to move, when to ask, and when a request should stop.',
    'boundary',
  ],
  [
    'blush',
    'continuity',
    'The thread stays intact',
    'Carry open loops, active priorities, and relationship context between tools and providers.',
    'continuity',
  ],
  [
    'blush',
    'corrections',
    'Teach it once',
    'Correct an assumption and deal makes that correction stronger than stale or inferred memory.',
    'correction',
  ],
  [
    'blue',
    'professional context',
    'The right mind for the work',
    'Switch between founder, analyst, clinician, operator, or advisor without losing the person underneath.',
    'profession',
  ],
  [
    'lilac',
    'authority',
    'Scoped by design',
    'Each connected agent receives only the authority, context, and sensitivity it has earned.',
    'authority',
  ],
  [
    'blue',
    'outcomes',
    'Memory that learns from outcomes',
    'Close the loop after a decision so future context reflects what actually worked.',
    'outcomes',
  ],
  [
    'lilac',
    'voice',
    'Human in the details',
    'Tone, rhythm, warmth, directness, and disagreement style are part of the operating model.',
    'voice',
  ],
  [
    'blush',
    'privacy',
    'Grounded, not exposed',
    'Sensitive context is scoped, redacted, signed, and kept under the human’s control.',
    'privacy',
  ],
];

const benefits = [
  [
    '01',
    'One human model',
    'Keep identity and judgment consistent across every agent.',
  ],
  ['02', 'Provider neutral', 'Use the models and runtimes you already trust.'],
  [
    '03',
    'Evidence over guesses',
    'Separate confirmed facts from inference and memory.',
  ],
  [
    '04',
    'Correction first',
    'Your direct correction always wins over stale context.',
  ],
  [
    '05',
    'Ask at the edge',
    'Make ambiguity visible before it becomes an action.',
  ],
  [
    '06',
    'Portable by design',
    'Your context belongs to you, not to a single provider.',
  ],
  ['07', 'Signed context', 'Every packet is scoped, expiring, and verifiable.'],
  [
    '08',
    'Quietly present',
    'The best context feels like understanding, not interruption.',
  ],
  [
    '09',
    'Built for real work',
    'From personal decisions to regulated professional domains.',
  ],
];

const faqs = [
  [
    'What is deal?',
    'deal is the human context layer for AI agents. It gives an agent a grounded understanding of who it represents, how that person thinks, what matters to them, and where the boundaries are.',
  ],
  [
    'Does deal replace my model or agent framework?',
    'No. Your existing agent keeps its model, tools, execution loop, and provider credentials. deal gives that agent the human context to use them well.',
  ],
  [
    'Which agents can use deal?',
    'Any agent that can call an API or use an SDK. The first adapters cover OpenAI, Claude, LangChain, Vercel AI, OpenRouter, Codex, Cursor, and custom runtimes.',
  ],
  [
    'Can I correct what the agent remembers?',
    'Yes. Corrections are first-class context. They supersede conflicting inferred or stale memory and are retained with provenance.',
  ],
  [
    'Does deal make decisions for me?',
    'It helps an agent reason in your style and enforce your boundaries. Consequential actions can still require your explicit approval.',
  ],
  [
    'Where does my context live?',
    'deal keeps canonical identity, authority, memory provenance, and governance in its own protected data layer. Semantic retrieval is optional and remains subordinate to your canonical model.',
  ],
  [
    'Can teams use one human model?',
    'Yes. Organizations can maintain shared context while preserving individual identity, authority, and sensitive boundaries.',
  ],
  [
    'How does this work for finance or healthcare?',
    'Professional context is scoped by role, domain, jurisdiction, and evidence. deal provides operating guidance and boundaries; it does not invent licensing or replace qualified professionals.',
  ],
];

function navigate(path: Route) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname as Route);
  useEffect(() => {
    const update = () => setPath(window.location.pathname as Route);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  if (
    path === '/about' ||
    path === '/sign-in' ||
    path === '/sign-up' ||
    path === '/app'
  )
    return path;
  return '/';
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <button
      className={`logo ${light ? 'logo-light' : ''}`}
      onClick={() => navigate('/')}
    >
      <img
        className="brand-symbol"
        src="/deal-mark.svg"
        alt=""
        width="25"
        height="25"
      />
      <span>deal</span>
    </button>
  );
}

function Arrow() {
  return <span aria-hidden="true">↗︎</span>;
}

function Button({
  children,
  secondary = false,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  secondary?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      className={`button ${secondary ? 'button-secondary' : ''}`}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function Notch({ variant = 'chat' }: { variant?: string }) {
  const rows: Record<string, string[]> = {
    chat: ['context ready', 'voice: direct · warm'],
    identity: ['human model', 'confidence 98%'],
    context: ['task context', '3 memories selected'],
    judgment: ['decision style', 'ask before commitment'],
    memory: ['memory evidence', 'confirmed · 2 sources'],
    boundary: ['boundary check', 'approval required'],
    continuity: ['open loop', 'partner follow-up'],
    correction: ['correction saved', 'supersedes inference'],
    profession: ['professional mode', 'financial analyst'],
    authority: ['delegation scope', 'read · draft · ask'],
    outcomes: ['outcome recorded', 'reply quality improved'],
    voice: ['response guidance', 'concise · evidence-led'],
    privacy: ['packet signed', 'expires in 14 min'],
  };
  const [first, second] = rows[variant] ?? rows.chat;
  return (
    <div className="notch" aria-label={`${first}, ${second}`}>
      <span className="notch-dot green-dot" />
      <span className="notch-label">{first}</span>
      <span className="notch-divider" />
      <span className="notch-label muted-label">{second}</span>
      <span className="notch-dot lilac-dot" />
    </div>
  );
}

function Atmosphere({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className={`atmosphere ${dark ? 'atmosphere-dark' : ''}`}>
      {children}
    </div>
  );
}

function HomeSectionLink({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`/#${id}`}
      onClick={(event) => {
        if (window.location.pathname === '/') return;
        event.preventDefault();
        navigate('/');
        window.setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        }, 0);
      }}
    >
      {children}
    </a>
  );
}

function PublicFooter() {
  return (
    <footer className="footer container">
      <div className="footer-top">
        <Logo />
        <div className="footer-links">
          <HomeSectionLink id="features">Product</HomeSectionLink>
          <HomeSectionLink id="how-it-works">How it works</HomeSectionLink>
          <a
            href="/about"
            onClick={(event) => {
              event.preventDefault();
              navigate('/about');
            }}
          >
            About
          </a>
          <HomeSectionLink id="faq">Faq</HomeSectionLink>
          <a href="https://github.com/zester4/deal-engine">Github</a>
        </div>
        <span className="footer-note">
          Human context for the agents you already use.
        </span>
      </div>
      <div className="footer-bottom">
        <span>© 2026 deal</span>
        <span>Built for thoughtful agents and the people they represent.</span>
        <div>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </div>
    </footer>
  );
}

function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <div className="site">
      <Atmosphere>
        <header className="nav container">
          <Logo />
          <div className="demo-notch">
            <span className="tiny-dot green-dot" />
            <span>your context is ready</span>
            <button onClick={() => navigate('/app')}>
              try the workspace <Arrow />
            </button>
          </div>
          <div className="nav-actions">
            <button className="nav-link" onClick={() => navigate('/about')}>
              About
            </button>
            <Button secondary onClick={() => navigate('/sign-in')}>
              Enter workspace <Arrow />
            </Button>
          </div>
        </header>
        <section className="hero container">
          <div className="hero-copy">
            <span className="eyebrow">the human context engine for agents</span>
            <h1>
              Your agent,<em>humanized.</em>
            </h1>
            <p className="hero-lede">
              deal gives every AI agent a grounded understanding of who you are,
              how you think, and how you want the work done.
            </p>
            <div className="hero-actions">
              <Button onClick={() => navigate('/sign-up')}>
                Give your agent a human <Arrow />
              </Button>
              <Button
                secondary
                onClick={() =>
                  document
                    .getElementById('how-it-works')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                See how it works
              </Button>
            </div>
          </div>
          <div className="hero-compatibility">
            <span>works with the agents you already use</span>
            <div className="pill-row">
              {integrations.map((item) => (
                <span className="integration-pill" key={item}>
                  <BrandIcon name={item} />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-landscape" aria-hidden="true" />
        </section>
      </Atmosphere>
      <section className="workflow-section" id="how-it-works">
        <div className="container section-center">
          <span className="eyebrow">less explaining. more doing.</span>
          <h2>
            Stop reintroducing yourself
            <br />
            <em>to every agent.</em>
          </h2>
          <p className="section-lede">
            One human model follows you from conversation to conversation,
            provider to provider, and decision to decision.
          </p>
          <div className="session-grid">
            {sessions.map((session) => (
              <article className="session-card" key={session.title}>
                <div className="session-status">
                  <span className={`status-dot ${session.color}`} />
                  {session.status}
                  <span className="session-line" />
                </div>
                <h3>{session.title}</h3>
                <p>{session.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="features-section container" id="features">
        <div className="section-heading">
          <span className="eyebrow">
            the layer between intelligence and action
          </span>
          <h2>
            Everything an agent needs
            <br />
            <em>to understand the human.</em>
          </h2>
        </div>
        <div className="feature-grid">
          {features.map(([tone, tag, title, body, variant]) => (
            <article className="feature-card" key={title}>
              <div className={`mockup-panel ${tone} preview-${variant}`}>
                <Notch variant={variant} />
                <div className="mockup-window">
                  <div className="window-bar">
                    <span />
                    <span />
                    <span />
                    <small>{tag}</small>
                  </div>
                  <div className="preview-content">
                    <span className="preview-eyebrow">
                      {variant === 'boundary'
                        ? 'human checkpoint'
                        : variant === 'memory'
                          ? 'verified evidence'
                          : 'human context'}
                    </span>
                    <strong>{title}</strong>
                    <p>
                      {variant === 'voice'
                        ? '“Lead with the point. Keep the warmth.”'
                        : variant === 'correction'
                          ? 'Explicit correction → confirmed preference'
                          : variant === 'profession'
                            ? 'Financial analyst · evidence required'
                            : variant === 'boundary'
                              ? 'Ask before making an external commitment.'
                              : variant === 'privacy'
                                ? 'Sensitive details redacted · packet signed'
                                : 'Your priorities. Your voice. In every turn.'}
                    </p>
                    <div className="preview-chips">
                      <span>
                        {variant === 'memory'
                          ? 'user confirmed'
                          : 'context ready'}
                      </span>
                      <span>
                        {variant === 'authority' ? 'read + draft' : 'scoped'}
                      </span>
                    </div>
                  </div>
                  <div className="window-footer">
                    <span className="mini-check">✓</span>
                    <span>grounded context</span>
                    <span className="mini-progress" />
                  </div>
                </div>
              </div>
              <span className="feature-tag">{tag}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="benefits-section container">
        <div className="divider" />
        <div className="benefit-grid">
          {benefits.map(([number, title, body]) => (
            <article className="benefit" key={number}>
              <span className="benefit-icon">{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="integrations-section">
        <div className="container section-center">
          <span className="eyebrow">bring your own agent</span>
          <h2>
            Keep the tools
            <br />
            <em>you already love.</em>
          </h2>
          <p className="section-lede">
            deal sits quietly beside your stack. It supplies the human layer
            while your agent keeps its model, tools, and way of working.
          </p>
          <div className="integration-cards">
            <article className="integration-card">
              <div className="provider-signature">
                <OpenAI size={32} />
                <Claude size={32} />
                <OpenRouter size={32} />
              </div>
              <span className="card-kicker">native sdk</span>
              <h3>
                One small layer.
                <br />
                Every provider.
              </h3>
              <p>
                Connect once and carry identity, memory, judgment, and
                boundaries into every model call.
              </p>
              <button onClick={() => navigate('/sign-up')}>
                Explore the sdk <Arrow />
              </button>
            </article>
            <article className="integration-card integration-card-dark">
              <div className="provider-signature">
                <LangChain size={32} />
                <Vercel size={32} />
                <Cursor size={32} />
              </div>
              <span className="card-kicker">agent runtime</span>
              <h3>
                Your agent stays
                <br />
                in the driver’s seat.
              </h3>
              <p>
                deal does not own your tools or execution loop. It helps your
                agent understand when and how to use them.
              </p>
              <button onClick={() => navigate('/sign-up')}>
                See the architecture <Arrow />
              </button>
            </article>
          </div>
          <div className="pill-row pill-row-wide">
            {[
              'OpenAI Agents',
              'Claude Agent SDK',
              'LangChain v1',
              'Vercel AI SDK',
              'OpenRouter',
              'Responses API',
              'Chat Completions',
              'Custom runtime',
            ].map((item) => (
              <span className="integration-pill" key={item}>
                <BrandIcon name={item} size={16} />
                {item}
              </span>
            ))}
          </div>
          <div className="terminal-row">
            <span className="terminal-mark">›_</span>
            <span>Works anywhere your agent can make an API call.</span>
            <a href="#features">
              Read the integration guide <Arrow />
            </a>
          </div>
        </div>
      </section>
      <section className="pricing-section container">
        <div className="section-center pricing-heading">
          <span className="eyebrow">early access</span>
          <h2>
            Make your agent feel
            <br />
            <em>like it knows you.</em>
          </h2>
        </div>
        <div className="pricing-card">
          <div className="pricing-offer">
            <span className="offer-badge">founding access</span>
            <h3>
              Human context
              <br />
              for your agents.
            </h3>
            <p>
              Start building with the identity, memory, and judgment layer your
              agents have been missing.
            </p>
            <div className="price">
              <small>from</small>
              <strong>$0</strong>
              <span>while in early access</span>
            </div>
            <Button onClick={() => navigate('/sign-up')}>
              Start shaping your agent <Arrow />
            </Button>
            <a href="#faq">Questions? Read the faq</a>
          </div>
          <div className="pricing-benefits">
            <span className="card-kicker">included from day one</span>
            {[
              'A portable human model',
              'Provider-neutral sdk and adapters',
              'Memory with provenance and corrections',
              'Scoped context packets',
              'Boundaries and approval logic',
              'A workspace to review what your agent learns',
            ].map((item) => (
              <div className="benefit-line" key={item}>
                <span>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="licence-note">
          No credit card required. Your context stays yours, even when the model
          changes.
        </p>
        <blockquote>
          One understanding of you.
          <br />
          Every agent you work with.
        </blockquote>
        <div className="resource-grid">
          <a href="#features">
            <span>01</span>
            <strong>Human context, explained</strong>
            <small>Why intelligence needs identity.</small>
            <Arrow />
          </a>
          <a href="#how-it-works">
            <span>02</span>
            <strong>Inside the context packet</strong>
            <small>What reaches your agent each turn.</small>
            <Arrow />
          </a>
          <a href="#faq">
            <span>03</span>
            <strong>Trust by design</strong>
            <small>Boundaries, memory, and approval.</small>
            <Arrow />
          </a>
          <a href="https://github.com/zester4/deal-engine">
            <span>04</span>
            <strong>Build with deal</strong>
            <small>Read the open architecture.</small>
            <Arrow />
          </a>
        </div>
      </section>
      <section className="faq-section" id="faq">
        <div className="container">
          <span className="eyebrow">questions, answered</span>
          <h2>
            Good context deserves
            <br />
            <em>good questions.</em>
          </h2>
          <div className="faq-list">
            {faqs.map(([question, answer], index) => (
              <div
                className={`faq-row ${openFaq === index ? 'faq-open' : ''}`}
                key={question}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span>{question}</span>
                  <b>{openFaq === index ? '−' : '+'}</b>
                </button>
                {openFaq === index && <p>{answer}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
      <Atmosphere dark>
        <section className="closing-cta container section-center">
          <span className="eyebrow">the human layer for the agent era</span>
          <h2>
            Make a little more room
            <br />
            <em>for understanding.</em>
          </h2>
          <p className="section-lede">
            Give your agents a way to know who they are helping before they
            decide what to do.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate('/sign-up')}>
              Give your agent a human <Arrow />
            </Button>
            <Button secondary onClick={() => navigate('/sign-in')}>
              Enter the workspace
            </Button>
          </div>
          <small>
            No credit card required · start with your existing agent
          </small>
        </section>
      </Atmosphere>
      <PublicFooter />
    </div>
  );
}

function AboutPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'about deal — the human layer for agents';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const principles = [
    [
      '01',
      'Identity before instruction',
      'An agent should know who it represents before it decides what to say or do.',
    ],
    [
      '02',
      'Context has a source',
      'Confirmed facts, preferences, inferences, and outcomes should never blur into one voice.',
    ],
    [
      '03',
      'Judgment is the product',
      'The useful layer is not what a person likes. It is how they weigh tradeoffs and uncertainty.',
    ],
    [
      '04',
      'Corrections are sacred',
      'When a person says “that is not me,” the model changes immediately and visibly.',
    ],
    [
      '05',
      'Boundaries create trust',
      'A humanized agent knows when to act, when to ask, and when to stop.',
    ],
    [
      '06',
      'Portable by design',
      'The human model belongs to the person, not to a particular model provider or chat window.',
    ],
  ];
  const contextSteps = [
    [
      '01',
      'Model the person',
      'Identity, values, voice, relationships, and professional context.',
    ],
    [
      '02',
      'Read the moment',
      'The task, audience, stakes, and current signals around the request.',
    ],
    [
      '03',
      'Compile what matters',
      'A small, scoped packet with provenance, boundaries, and judgment guidance.',
    ],
    [
      '04',
      'Learn carefully',
      'Outcomes and explicit corrections refine the model without rewriting the person.',
    ],
  ];

  return (
    <div className="about-page site">
      <Atmosphere>
        <header className="nav container about-nav">
          <Logo />
          <div className="nav-actions">
            <span className="about-nav-label">about deal</span>
            <Button secondary onClick={() => navigate('/sign-in')}>
              Enter workspace <Arrow />
            </Button>
          </div>
        </header>
        <section className="about-hero container">
          <div className="about-hero-copy">
            <span className="eyebrow">why deal exists</span>
            <h1>
              The human layer
              <br />
              <em>between intent and action.</em>
            </h1>
            <p>
              Models can reason. Agents can act. deal gives them the missing
              understanding: a living, portable model of the person they are
              helping.
            </p>
            <div className="hero-actions">
              <Button onClick={() => navigate('/sign-up')}>
                Build your human model <Arrow />
              </Button>
              <Button secondary onClick={() => navigate('/')}>
                Back to the homepage
              </Button>
            </div>
          </div>
          <div
            className="about-hero-art"
            aria-label="A scoped deal context packet"
          >
            <div className="about-art-image" />
            <div className="about-packet">
              <div className="about-packet-top">
                <span className="packet-status">
                  <i /> context packet
                </span>
                <span>expires in 14m</span>
              </div>
              <div className="about-packet-heading">
                <span className="preview-eyebrow">
                  for this person · this moment
                </span>
                <strong>Founder / thoughtful operator</strong>
                <p>
                  Direct when the stakes are high. Warm when trust is being
                  built.
                </p>
              </div>
              <div className="about-packet-rows">
                <span>
                  <b>voice</b> concise · evidence-led
                </span>
                <span>
                  <b>boundary</b> ask before commitment
                </span>
                <span>
                  <b>source</b> confirmed by human
                </span>
              </div>
              <div className="about-packet-footer">
                <span>identity · judgment · memory</span>
                <span className="packet-scope">scoped</span>
              </div>
            </div>
          </div>
        </section>
      </Atmosphere>
      <main>
        <section className="about-manifesto">
          <div className="container">
            <div className="about-section-intro">
              <span className="eyebrow">a different starting point</span>
              <h2>
                A person is more than
                <br />
                <em>a list of preferences.</em>
              </h2>
              <p>
                Most agents start with a prompt and a pile of retrieved text.
                deal starts with the human. It keeps the difference between a
                fact and a feeling, a boundary and a suggestion, a lesson and a
                guess.
              </p>
            </div>
            <div className="manifesto-grid">
              <article>
                <span>01</span>
                <strong>What matters</strong>
                <p>
                  Values, priorities, relationships, and the things worth
                  protecting.
                </p>
              </article>
              <article>
                <span>02</span>
                <strong>How to think</strong>
                <p>
                  Decision style, risk posture, communication rhythm, and
                  tradeoffs.
                </p>
              </article>
              <article>
                <span>03</span>
                <strong>When to stop</strong>
                <p>
                  Boundaries, uncertainty, sensitivity, and the moments that
                  need a human.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="about-principles container">
          <div className="section-heading about-heading">
            <span className="eyebrow">the deal point of view</span>
            <h2>
              Understanding is a system,
              <br />
              <em>not a personality prompt.</em>
            </h2>
          </div>
          <div className="principle-grid">
            {principles.map(([number, title, body]) => (
              <article className="principle-card" key={number}>
                <span className="principle-number">{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="about-loop">
          <div className="container">
            <div className="about-loop-heading">
              <span className="eyebrow">the context loop</span>
              <h2>
                A quiet layer
                <br />
                <em>that keeps the thread.</em>
              </h2>
              <p>
                deal is designed to sit underneath the agents you already use.
                It does not replace their tools or execution loop. It makes the
                person inside that loop legible.
              </p>
            </div>
            <div className="context-timeline">
              {contextSteps.map(([number, title, body], index) => (
                <article className="timeline-step" key={number}>
                  <div className="timeline-marker">
                    <span>{number}</span>
                    {index < contextSteps.length - 1 && <i />}
                  </div>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="about-origin container">
          <div className="origin-copy">
            <span className="eyebrow">built for the space between</span>
            <h2>
              The prompt tells an agent
              <br />
              <em>what to do.</em>
            </h2>
            <p>
              The human model helps it understand who is asking, what good looks
              like, what has already been tried, and what should never be
              assumed. That is the difference between a capable response and a
              response that feels like it came from you.
            </p>
            <a
              className="dark-link"
              href="https://github.com/zester4/deal-engine"
            >
              Read the open architecture <Arrow />
            </a>
          </div>
          <div className="origin-card">
            <div className="origin-card-top">
              <span className="tiny-dot green-dot" />
              <span>deal runtime</span>
              <span>v1 · stable context</span>
            </div>
            <div className="origin-card-body">
              <span className="preview-eyebrow">agent receives</span>
              <strong>Enough understanding to choose well.</strong>
              <div className="origin-lines">
                <span>
                  <i /> identity and role
                </span>
                <span>
                  <i /> current priorities
                </span>
                <span>
                  <i /> relevant memory
                </span>
                <span>
                  <i /> judgment + boundaries
                </span>
              </div>
            </div>
            <div className="origin-card-footer">
              <span>signed context</span>
              <span>human stays in control</span>
            </div>
          </div>
        </section>
      </main>
      <Atmosphere dark>
        <section className="closing-cta about-closing container section-center">
          <span className="eyebrow">the work is still yours</span>
          <h2>
            Give your agent a way
            <br />
            <em>to know you.</em>
          </h2>
          <p className="section-lede">
            Start with a human model that can travel wherever your work does.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate('/sign-up')}>
              Start with deal <Arrow />
            </Button>
            <Button secondary onClick={() => navigate('/')}>
              See the product
            </Button>
          </div>
        </section>
      </Atmosphere>
      <PublicFooter />
    </div>
  );
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [submitted, setSubmitted] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }
  const signIn = mode === 'sign-in';
  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />
        <div className="auth-content">
          <Logo light />
          <span className="eyebrow">the human context engine</span>
          <h1>
            {signIn
              ? 'Welcome back to your human model.'
              : 'Give your agent a better understanding.'}
          </h1>
          <p>
            {signIn
              ? 'Your context, your boundaries, and the work already in motion.'
              : 'Start with the person behind the prompt. Build a context layer that travels.'}
          </p>
          <div className="auth-preview">
            <Notch variant="chat" />
            <strong>context ready</strong>
            <span>identity · memory · judgment</span>
          </div>
        </div>
      </div>
      <main className="auth-form-wrap">
        <div className="auth-form-top">
          <button className="text-button" onClick={() => navigate('/')}>
            ← Back to deal
          </button>
          <span>
            {signIn ? 'New here?' : 'Already have an account?'}{' '}
            <button
              className="inline-link"
              onClick={() => navigate(signIn ? '/sign-up' : '/sign-in')}
            >
              {signIn ? 'Create an account' : 'Sign in'}
            </button>
          </span>
        </div>
        <div className="auth-form">
          <span className="eyebrow">
            {signIn ? 'welcome back' : 'early access'}
          </span>
          <h2>{signIn ? 'Enter your workspace.' : 'Start with the human.'}</h2>
          <p>
            {signIn
              ? 'Sign in to review what your agents understand and how they act.'
              : 'Create your workspace and start shaping the context your agents carry.'}
          </p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input type="email" placeholder="you@company.com" required />
            </label>
            {!signIn && (
              <label>
                What should we call you?
                <input type="text" placeholder="Your name" required />
              </label>
            )}
            <Button type="submit">
              {signIn ? 'Continue with email' : 'Create workspace'} <Arrow />
            </Button>
          </form>
          <div className="auth-divider">
            <span>or continue with</span>
          </div>
          <Button secondary onClick={() => setSubmitted(true)}>
            Continue with single sign-on
          </Button>
          {submitted && (
            <div className="auth-message">
              Your secure sign-in flow will open here when authentication is
              connected.
            </div>
          )}
          <small className="auth-legal">
            By continuing, you agree to the deal terms and privacy policy.
          </small>
        </div>
      </main>
    </div>
  );
}

function DashboardPage() {
  const [active, setActive] = useState('Overview');
  const navItems = ['Overview', 'Human model', 'Memory', 'Agents', 'Approvals'];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-switch">
          <span className="workspace-avatar">DF</span>
          <span>
            <strong>Demo Founder</strong>
            <small>personal workspace</small>
          </span>
          <span>⌄</span>
        </div>
        <nav>
          {navItems.map((item, index) => (
            <button
              className={active === item ? 'nav-active' : ''}
              onClick={() => setActive(item)}
              key={item}
            >
              <span className="nav-icon">
                {['◌', '◈', '⌁', '◇', '✓'][index]}
              </span>
              {item}
              {item === 'Approvals' && <b>2</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => navigate('/')}>
            <span className="nav-icon">↗</span>View homepage
          </button>
          <button onClick={() => navigate('/sign-in')}>
            <span className="nav-icon">↪</span>Sign out
          </button>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <div>
            <span className="eyebrow">
              {active === 'Overview' ? 'tuesday, october 20' : 'human context'}
            </span>
            <h1>{active === 'Overview' ? 'Good morning, founder.' : active}</h1>
          </div>
          <div className="app-actions">
            <span className="sync-status">
              <i /> synced just now
            </span>
            <button className="avatar-button">DF</button>
          </div>
        </header>
        {active === 'Overview' ? (
          <Overview />
        ) : (
          <PlaceholderView title={active} />
        )}
      </main>
    </div>
  );
}

function Overview() {
  return (
    <div className="overview">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">your human model</span>
          <h2>
            Clear enough to
            <br />
            <em>act like you.</em>
          </h2>
          <p>
            Everything your agents need to understand the person behind the
            work, kept in one living model.
          </p>
          <button className="dark-link">
            Review the model <Arrow />
          </button>
        </div>
        <div className="dashboard-model">
          <Notch variant="identity" />
          <div className="model-surface">
            <span className="surface-label">current signal</span>
            <strong>Protect durable trust.</strong>
            <p>Priority 01 · confirmed by you</p>
            <div className="surface-bar">
              <i />
            </div>
          </div>
          <div className="model-tags">
            <span>identity</span>
            <span>values</span>
            <span>boundaries</span>
          </div>
        </div>
      </section>
      <div className="stat-grid">
        <div className="stat-card">
          <span>active agents</span>
          <strong>04</strong>
          <small>all within scope</small>
        </div>
        <div className="stat-card">
          <span>context turns</span>
          <strong>128</strong>
          <small>this month</small>
        </div>
        <div className="stat-card">
          <span>memory confidence</span>
          <strong>94%</strong>
          <small>up 8% this month</small>
        </div>
        <div className="stat-card stat-alert">
          <span>human checkpoints</span>
          <strong>02</strong>
          <small>waiting for you</small>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">agent activity</span>
              <h3>What is happening now</h3>
            </div>
            <button className="quiet-link">
              View all <Arrow />
            </button>
          </div>
          <div className="activity-list">
            <Activity
              dot="green"
              name="OpenAI agent"
              task="Drafting a partner reply"
              time="2 min ago"
              status="Context supplied"
            />
            <Activity
              dot="blue"
              name="Claude workspace"
              task="Reviewing the new brief"
              time="18 min ago"
              status="Learning"
            />
            <Activity
              dot="amber"
              name="Custom runtime"
              task="Paused before commitment"
              time="1 hr ago"
              status="Needs you"
            />
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">human checkpoints</span>
              <h3>Waiting for your call</h3>
            </div>
            <span className="panel-count">2</span>
          </div>
          <div className="checkpoint">
            <span className="checkpoint-icon">!</span>
            <div>
              <strong>External commitment</strong>
              <p>Agent wants to send a proposal to a new partner.</p>
              <small>Requires your approval · 12 min ago</small>
            </div>
          </div>
          <div className="checkpoint">
            <span className="checkpoint-icon">?</span>
            <div>
              <strong>Ambiguous preference</strong>
              <p>Should this be direct or more relational?</p>
              <small>Needs clarification · 34 min ago</small>
            </div>
          </div>
        </section>
      </div>
      <section className="dashboard-panel model-summary">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">model pulse</span>
            <h3>What deal understands about you</h3>
          </div>
          <button className="quiet-link">
            Open human model <Arrow />
          </button>
        </div>
        <div className="pulse-grid">
          <Pulse label="voice" value="direct, warm, evidence-led" />
          <Pulse label="decision style" value="reversible first" />
          <Pulse label="trust signal" value="clear tradeoffs" />
          <Pulse label="never assume" value="consent to commitment" />
        </div>
      </section>
    </div>
  );
}

function Activity({
  dot,
  name,
  task,
  time,
  status,
}: {
  dot: string;
  name: string;
  task: string;
  time: string;
  status: string;
}) {
  return (
    <div className="activity">
      <span className={`status-dot ${dot}`} />
      <div>
        <strong>{name}</strong>
        <p>{task}</p>
      </div>
      <div className="activity-meta">
        <span>{status}</span>
        <small>{time}</small>
      </div>
    </div>
  );
}
function Pulse({ label, value }: { label: string; value: string }) {
  return (
    <div className="pulse">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <div className="pulse-line">
        <i />
      </div>
    </div>
  );
}
function PlaceholderView({ title }: { title: string }) {
  return (
    <section className="empty-view">
      <span className="empty-mark">◌</span>
      <span className="eyebrow">{title.toLowerCase()}</span>
      <h2>
        A calmer place to
        <br />
        <em>understand the work.</em>
      </h2>
      <p>
        This section is ready for the next layer of your human context
        workspace.
      </p>
      <Button secondary onClick={() => navigate('/app')}>
        Back to overview
      </Button>
    </section>
  );
}

function App() {
  const route = useRoute();
  if (route === '/sign-in') return <AuthPage mode="sign-in" />;
  if (route === '/sign-up') return <AuthPage mode="sign-up" />;
  if (route === '/app') return <DashboardPage />;
  if (route === '/about') return <AboutPage />;
  return <HomePage />;
}

createRoot(document.getElementById('root')!).render(<App />);
