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
import { authClient, dealApiUrl } from './auth-client';

type Route = '/' | '/about' | '/sign-in' | '/sign-up' | '/app';

type DashboardAgent = {
  id: string;
  name: string;
  runtime: string;
  status: 'active' | 'suspended';
  credentials: Array<{
    id: string;
    active: boolean;
    expiresAt?: string;
    revokedAt?: string;
  }>;
};

type CreatedAgent = Omit<DashboardAgent, 'credentials'>;

function agentTypeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    'vercel-ai-sdk': 'Vercel AI',
    'vercel-ai': 'Vercel AI',
    openai: 'OpenAI',
    'openai-agents': 'OpenAI agents',
    claude: 'Claude',
    'claude-agent-sdk': 'Claude',
    langchain: 'LangChain',
    openrouter: 'OpenRouter',
  };
  return labels[normalized] ?? value;
}

type DashboardProfile = {
  human: {
    displayName: string;
    email: string;
    organizationId: string;
  };
};

async function dashboardRequest<T>(
  token: string | null,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${dealApiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok)
    throw new Error(body.error || `DEAL request failed (${response.status})`);
  return body;
}

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
    body: 'We noticed something new about how you like things done. You decide whether it belongs in your model.',
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
    'Memory you can trust',
    'Every remembered detail shows where it came from, how certain it is, and what you changed.',
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
    'Carry open loops, active priorities, and relationship context between agents and AI tools.',
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
    'limits',
    'Only what matters',
    'Each agent gets only the information and freedom it needs.',
    'limits',
  ],
  [
    'blue',
    'outcomes',
    'Learns from what happens',
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
    'Private details stay protected and remain under your control.',
    'privacy',
  ],
];

const benefits = [
  [
    '01',
    'One human model',
    'Keep identity and judgment consistent across every agent.',
  ],
  [
    '02',
    'Works with what you use',
    'Keep the AI tools and agents you already trust.',
  ],
  [
    '03',
    'Evidence over guesses',
    'Keep facts separate from guesses and old memories.',
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
    'Yours wherever you go',
    'Your way of thinking belongs to you, not to one AI company.',
  ],
  [
    '07',
    'Private by design',
    'Only the right details arrive, for only as long as they matter.',
  ],
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
    'deal gives AI agents a grounded understanding of who they are helping, how that person thinks, what matters to them, and where the boundaries are.',
  ],
  [
    'Does deal replace my model or agent framework?',
    'No. Your existing agent keeps its AI, tools, and way of working. deal gives it the understanding to use them well.',
  ],
  [
    'Which agents can use deal?',
    'Any agent that can connect to a service or AI tool. deal already works with OpenAI, Claude, LangChain, Vercel AI, OpenRouter, Codex, Cursor, and more.',
  ],
  [
    'Can I correct what the agent remembers?',
    'Yes. Your correction wins over an old memory or a guess, and deal keeps track of what you changed.',
  ],
  [
    'Does deal make decisions for me?',
    'It helps an agent reason in your style and enforce your boundaries. Consequential actions can still require your explicit approval.',
  ],
  [
    'Where does my context live?',
    'deal keeps your identity, memories, boundaries, and choices protected. Smart search is optional and never overrides what you have confirmed.',
  ],
  [
    'Can teams use one human model?',
    'Yes. Teams can share useful knowledge while each person keeps their own voice, choices, and private details.',
  ],
  [
    'How does this work for finance or healthcare?',
    'deal can adapt to the person’s role, field, location, and evidence. It helps an agent stay careful; it never invents qualifications or replaces a qualified professional.',
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
    chat: ['ready to help', 'voice: direct · warm'],
    identity: ['human model', 'confidence 98%'],
    context: ['task context', '3 memories selected'],
    judgment: ['decision style', 'ask before commitment'],
    memory: ['memory evidence', 'confirmed · 2 sources'],
    boundary: ['boundary check', 'approval required'],
    continuity: ['open loop', 'partner follow-up'],
    correction: ['correction saved', 'supersedes inference'],
    profession: ['professional mode', 'financial analyst'],
    authority: ['what it may do', 'read · suggest · ask'],
    outcomes: ['outcome recorded', 'reply quality improved'],
    voice: ['response guidance', 'concise · evidence-led'],
    privacy: ['private and temporary', 'for this moment'],
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
          Human understanding for the agents you already use.
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
              try it now <Arrow />
            </button>
          </div>
          <div className="nav-actions">
            <button className="nav-link" onClick={() => navigate('/about')}>
              About
            </button>
            <Button secondary onClick={() => navigate('/sign-in')}>
              Meet your model <Arrow />
            </Button>
          </div>
        </header>
        <section className="hero container">
          <div className="hero-copy">
            <span className="eyebrow">the human side of ai agents</span>
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
            One human model follows you from conversation to conversation, from
            one AI tool to another, and decision to decision.
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
                          : 'your understanding'}
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
                                ? 'Private details hidden · protected'
                                : 'Your priorities. Your voice. In every turn.'}
                    </p>
                    <div className="preview-chips">
                      <span>
                        {variant === 'memory'
                          ? 'you confirmed it'
                          : 'ready to help'}
                      </span>
                      <span>
                        {variant === 'authority' ? 'read + suggest' : 'limited'}
                      </span>
                    </div>
                  </div>
                  <div className="window-footer">
                    <span className="mini-check">✓</span>
                    <span>based on what you told us</span>
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
              <span className="card-kicker">works with your tools</span>
              <h3>
                One small layer.
                <br />
                Every model.
              </h3>
              <p>
                Connect once and carry your identity, memories, choices, and
                boundaries into every conversation.
              </p>
              <button onClick={() => navigate('/sign-up')}>
                See how it connects <Arrow />
              </button>
            </article>
            <article className="integration-card integration-card-dark">
              <div className="provider-signature">
                <LangChain size={32} />
                <Vercel size={32} />
                <Cursor size={32} />
              </div>
              <span className="card-kicker">your agent, your way</span>
              <h3>
                Your agent stays
                <br />
                in the driver’s seat.
              </h3>
              <p>
                deal does not take over your tools or way of working. It helps
                your agent understand when and how to use them.
              </p>
              <button onClick={() => navigate('/sign-up')}>
                See how it connects <Arrow />
              </button>
            </article>
          </div>
          <div className="pill-row pill-row-wide">
            {[
              'OpenAI Agents',
              'Claude agent',
              'LangChain v1',
              'Vercel AI',
              'OpenRouter',
              'OpenAI chat',
              'Claude chat',
              'Other agents',
            ].map((item) => (
              <span className="integration-pill" key={item}>
                <BrandIcon name={item} size={16} />
                {item}
              </span>
            ))}
          </div>
          <div className="terminal-row">
            <span className="terminal-mark">›_</span>
            <span>Works anywhere your agent works.</span>
            <a href="#features">
              See how it works <Arrow />
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
              Human understanding
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
              'Works with the AI tools you already use',
              'Memory with sources and corrections',
              'Only the right details reach your agent',
              'Clear limits and moments to ask you',
              'A place to see what your agent learns',
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
            <strong>Human understanding, explained</strong>
            <small>Why intelligence needs identity.</small>
            <Arrow />
          </a>
          <a href="#how-it-works">
            <span>02</span>
            <strong>What your agent sees</strong>
            <small>The right understanding for each moment.</small>
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
              Open your model
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
      'The human model belongs to the person, not to one AI company or chat window.',
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
      'A focused guide with clear sources, boundaries, and judgment guidance.',
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
              Meet your model <Arrow />
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
            aria-label="A view of what your agent needs to know"
          >
            <div className="about-art-image" />
            <div className="about-packet">
              <div className="about-packet-top">
                <span className="packet-status">
                  <i /> what your agent knows
                </span>
                <span>for this moment</span>
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
                <span className="packet-scope">just enough</span>
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
              <span className="eyebrow">how deal learns</span>
              <h2>
                A quiet layer
                <br />
                <em>that keeps the thread.</em>
              </h2>
              <p>
                deal is designed to sit underneath the agents you already use.
                It does not replace their tools or way of working. It helps the
                person behind the work stay understood.
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
              <span>deal at work</span>
              <span>always learning</span>
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
              <span>private by design</span>
              <span>you stay in control</span>
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, setPending] = useState(false);
  const signIn = mode === 'sign-in';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNewApiKey('');
    if (!email.trim() || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }
    setPending(true);
    try {
      const response = signIn
        ? await authClient.signIn.email({ email: email.trim(), password })
        : await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
          });
      if (response.error)
        throw new Error(response.error.message || 'Authentication failed.');
      const provisioned = await dashboardRequest<{
        apiKey?: string;
        human: DashboardProfile['human'];
      }>(null, '/v1/auth/provision', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (provisioned.apiKey) {
        setNewApiKey(provisioned.apiKey);
      } else {
        navigate('/app');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'That account could not be verified.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />
        <div className="auth-content">
          <Logo light />
          <span className="eyebrow">the human side of your ai</span>
          <h1>
            {signIn
              ? 'Welcome back to your human model.'
              : 'Give your agent a better understanding.'}
          </h1>
          <p>
            {signIn
              ? 'Your context, your boundaries, and the work already in motion.'
              : 'Start with the person behind the prompt. Build understanding that travels.'}
          </p>
          <div className="auth-preview">
            <Notch variant="chat" />
            <strong>ready to help</strong>
            <span>voice · choices · boundaries</span>
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
          <h2>
            {signIn ? 'Come back to your model.' : 'Start with the human.'}
          </h2>
          <p>
            {signIn
              ? 'Sign in to see what your agents understand and guide how they work.'
              : 'Create your account and DEAL will build your human model and connect your first agent.'}
          </p>
          <form onSubmit={submit}>
            {!signIn && (
              <label>
                Your name
                <input
                  type="text"
                  placeholder="Ada Lovelace"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                placeholder="At least 12 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={signIn ? 'current-password' : 'new-password'}
                minLength={12}
                required
              />
            </label>
            <Button type="submit">
              {pending
                ? signIn
                  ? 'Signing in…'
                  : 'Creating your model…'
                : signIn
                  ? 'Sign in'
                  : 'Create your model'}{' '}
              <Arrow />
            </Button>
          </form>
          {newApiKey && (
            <div className="auth-key-reveal">
              <span className="eyebrow">save this once</span>
              <strong>Your first connection key</strong>
              <code>{newApiKey}</code>
              <button
                className="quiet-link"
                onClick={() => navigator.clipboard.writeText(newApiKey)}
                type="button"
              >
                Copy key
              </button>
              <Button type="button" onClick={() => navigate('/app')}>
                See your model <Arrow />
              </Button>
            </div>
          )}
          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          <small className="auth-legal">
            Your password is handled by Better Auth. Agent keys are shown once
            and never listed again.
          </small>
        </div>
      </main>
    </div>
  );
}

function DashboardPage() {
  const [active, setActive] = useState('Overview');
  const [profile, setProfile] = useState<DashboardProfile['human']>();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navItems = ['Overview', 'Human model', 'Memory', 'Agents', 'Approvals'];

  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      navigate('/sign-in');
      return;
    }
    dashboardRequest<DashboardProfile>(null, '/v1/profile')
      .then((response) => setProfile(response.human))
      .catch(() => {
        navigate('/sign-in');
      });
  }, [session, sessionPending]);

  if (sessionPending || !session) return null;

  async function signOut() {
    await authClient.signOut();
    navigate('/sign-in');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-switch">
          <span className="workspace-avatar">DF</span>
          <span>
            <strong>{profile?.displayName ?? 'Your human model'}</strong>
            <small>{profile?.email ?? 'your context, your way'}</small>
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
          <button onClick={signOut}>
            <span className="nav-icon">↪</span>Sign out
          </button>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <div>
            <span className="eyebrow">
              {active === 'Overview' ? 'tuesday, october 20' : 'your model'}
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
        ) : active === 'Agents' ? (
          <AgentsView />
        ) : (
          <PlaceholderView title={active} />
        )}
      </main>
    </div>
  );
}

function AgentsView() {
  const [agents, setAgents] = useState<DashboardAgent[]>([]);
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('vercel-ai-sdk');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadAgents() {
    const response = await dashboardRequest<{ agents: DashboardAgent[] }>(
      null,
      '/v1/agents',
    );
    setAgents(response.agents);
  }

  useEffect(() => {
    loadAgents().catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not load agents.',
      );
    });
  }, []);

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await dashboardRequest<{
        agent: CreatedAgent;
        apiKey: string;
      }>(null, '/v1/agents', {
        method: 'POST',
        body: JSON.stringify({ name, runtime }),
      });
      setAgents((current) => [
        ...current,
        { ...response.agent, credentials: [] },
      ]);
      setKey(response.apiKey);
      setName('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not create the agent.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function rotateAgent(agent: DashboardAgent) {
    if (
      !window.confirm(
        `Rotate ${agent.name}'s key? The current key will stop working immediately.`,
      )
    )
      return;
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await dashboardRequest<{ apiKey: string }>(
        null,
        `/v1/agents/${agent.id}/credentials/rotate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setKey(response.apiKey);
      await loadAgents();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not rotate the key.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeCredential(agent: DashboardAgent) {
    const credential = agent.credentials.find((item) => item.active);
    if (!credential || !window.confirm(`Revoke ${agent.name}'s active key?`))
      return;
    setBusy(true);
    setErrorMessage('');
    try {
      await dashboardRequest(null, `/v1/credentials/${credential.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadAgents();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not revoke the key.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(key);
  }

  return (
    <div className="agent-manager">
      <section className="dashboard-hero agent-manager-hero">
        <div>
          <span className="eyebrow">your agents</span>
          <h2>
            Give every agent
            <br />
            <em>its own key.</em>
          </h2>
          <p>
            Each agent gets its own private connection. Add the key where that
            agent runs, and replace it any time without changing your model.
          </p>
        </div>
        <div className="dashboard-model agent-manager-signal">
          <Notch variant="authority" />
          <div className="model-surface">
            <span className="surface-label">how access works</span>
            <strong>One key. One agent. You stay in control.</strong>
            <p>Private keys appear once and are never listed again.</p>
          </div>
        </div>
      </section>
      {key && (
        <section className="key-reveal">
          <div>
            <span className="eyebrow">copy this now</span>
            <h3>Your new connection key</h3>
            <p>
              DEAL will not show it again. Keep it where your agent runs, never
              in a public website.
            </p>
          </div>
          <div className="key-value">
            <code>{key}</code>
            <button onClick={copyKey}>Copy key</button>
          </div>
          <button className="quiet-link" onClick={() => setKey('')}>
            I stored it <Arrow />
          </button>
        </section>
      )}
      <section className="dashboard-panel agent-create-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">new connection</span>
            <h3>Connect an agent</h3>
          </div>
        </div>
        <form className="agent-create-form" onSubmit={createAgent}>
          <label>
            Agent name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Vercel agent"
              required
            />
          </label>
          <label>
            AI tool
            <input
              value={runtime}
              onChange={(event) => setRuntime(event.target.value)}
              placeholder="Vercel AI"
              required
            />
          </label>
          <Button type="submit">{busy ? 'Working…' : 'Create key'}</Button>
        </form>
        {errorMessage && <div className="auth-error">{errorMessage}</div>}
      </section>
      <section className="dashboard-panel agent-list-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">your agents</span>
            <h3>Agents connected to you</h3>
          </div>
          <span className="panel-count">{agents.length}</span>
        </div>
        <div className="agent-list">
          {agents.map((agent) => {
            const activeCredential = agent.credentials.find(
              (credential) => credential.active,
            );
            return (
              <article className="agent-row" key={agent.id}>
                <span
                  className={`status-dot ${agent.status === 'active' ? 'green' : 'amber'}`}
                />
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agentTypeLabel(agent.runtime)}</p>
                </div>
                <span className="agent-status">
                  {activeCredential ? 'connected' : 'not connected'}
                </span>
                <div className="agent-actions">
                  <button onClick={() => rotateAgent(agent)} disabled={busy}>
                    Rotate
                  </button>
                  {activeCredential && (
                    <button
                      className="danger-link"
                      onClick={() => revokeCredential(agent)}
                      disabled={busy}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
              name="Claude agent"
              task="Reviewing the new brief"
              time="18 min ago"
              status="Learning"
            />
            <Activity
              dot="amber"
              name="Another agent"
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
      <p>This section is ready for the next layer of your human model.</p>
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
