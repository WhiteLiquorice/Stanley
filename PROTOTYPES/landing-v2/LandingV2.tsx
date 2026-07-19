import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Shield, Zap, Lock, Workflow, CheckCircle2,
  AlertCircle, X, ArrowRight, Cloud, LayoutGrid, Layers,
} from 'lucide-react';
import { signIn, signUp, isLoggedIn } from '../../src/lib/firebaseAuth';
import { useScrollReveal } from './useScrollReveal';
import { GridCanvas } from './GridCanvas';
import './LandingV2.css';

/* ── Data ────────────────────────────────────────────────────── */

const features = [
  {
    icon: <Workflow size={24} />,
    accent: 'violet',
    title: 'Constrained AI Workflows',
    desc: 'A Mission defines the outcome while explicit nodes, parameters, branches, and policies constrain how Stanley reaches it. The model works inside a typed graph with execution limits and review gates.',
    wide: true,
  },
  {
    icon: <Shield size={24} />,
    accent: 'cyan',
    title: 'Reliable Recovery',
    desc: 'Retries, checkpoints, selector fallbacks, traces, and exception review help failed runs stop safely and recover deliberately.',
  },
  {
    icon: <Zap size={24} />,
    accent: 'cyan',
    title: 'Universal Integrations',
    desc: "Use built-in operations when available, then generate and approve a connector for APIs Stanley hasn't seen before.",
  },
  {
    icon: <LayoutGrid size={24} />,
    accent: 'violet',
    title: 'Visual Workflow Editor',
    desc: 'Build and inspect automation flows in a drag-and-drop canvas with branching, loops, and approval gates. Every node is visible and editable.',
    wide: true,
  },
  {
    icon: <Cloud size={24} />,
    accent: 'violet',
    title: 'Cloud Execution',
    desc: "Runs execute in Stanley's cloud infrastructure with real-time progress streaming, evidence capture, and artifact storage.",
  },
  {
    icon: <Layers size={24} />,
    accent: 'cyan',
    title: 'Reusable Templates',
    desc: 'Start from community templates or save your workflows as reusable blueprints for your team.',
  },
];

const steps = [
  { num: '1', title: 'Define the Mission', desc: 'Start from a template, describe an outcome to Copilot, or build directly in the visual workflow editor.' },
  { num: '2', title: 'Inspect the Plan', desc: 'Review nodes, parameters, branches, integrations, permissions, and execution limits before saving.' },
  { num: '3', title: 'Execute & Verify', desc: "Stanley's cloud runner executes browser or API steps, records evidence, and surfaces exceptions for review." },
];

const comparisons = [
  { cap: 'Workflow creation', stanley: 'Natural language, templates, and visual editing', other: 'Usually manual or prompt-only' },
  { cap: 'Execution strategy', stanley: 'Browser, native API, generated connector, and agent nodes', other: 'One execution mode' },
  { cap: 'AI control', stanley: 'Mission, policy, step, and approval constraints', other: 'Unconstrained prompts or no AI' },
  { cap: 'Failure handling', stanley: 'Retries, checkpoints, evidence, and exception review', other: 'Basic retry or stop' },
  { cap: 'Extensibility', stanley: 'Versioned connectors and reusable templates', other: 'Fixed catalog or one-off scripts' },
];

/* ── Component ───────────────────────────────────────────────── */

export function LandingV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [modalMode, setModalMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useScrollReveal();

  /* Sync body background with dark theme */
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0C1425';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  useEffect(() => {
    if (searchParams.get('login') === 'true') setShowLoginModal(true);
  }, [searchParams]);

  /* ── Auth handlers (preserved from production Landing) ─────── */

  const handleLaunchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoggedIn()) navigate('/dashboard');
    else setShowLoginModal(true);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    const result = await signIn(email.trim(), password);
    if (result.ok) { setShowLoginModal(false); setSearchParams({}); navigate('/dashboard'); }
    else setLoginError(result.error || 'Sign in failed. Please check your credentials.');
    setIsSubmitting(false);
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    const result = await signUp(email.trim(), password);
    if (result.ok) { setShowLoginModal(false); setSearchParams({}); navigate('/dashboard'); }
    else setLoginError(result.error || 'Could not create account. Please try again.');
    setIsSubmitting(false);
  };

  const switchMode = (mode: 'signin' | 'signup') => { setModalMode(mode); setLoginError(''); };

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="landing-v2">
      {/* Animated mesh gradient background */}
      <div className="v2-mesh">
        <div className="v2-orb v2-orb-1" />
        <div className="v2-orb v2-orb-2" />
        <div className="v2-orb v2-orb-3" />
      </div>

      {/* ── Navbar ────────────────────────────────────────────── */}
      <header className="v2-nav">
        <div className="v2-nav-inner">
          <div className="v2-logo" onClick={() => navigate('/')}>
            <img src="/favicon.svg" alt="Stanley" />
            <span>STANLEY</span>
          </div>
          <nav className="v2-nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div>
            <button onClick={handleLaunchClick} className="v2-btn v2-btn-primary v2-btn-sm">
              Open Cockpit
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="v2-hero">
        <GridCanvas />
        <div className="v2-hero-content">
          <div className="v2-badge">
            <Zap size={14} />
            Browser & API Automation
          </div>

          <h1 className="v2-hero-title">
            Your browser, <span className="v2-shimmer">on autopilot.</span>
          </h1>

          <p className="v2-hero-sub">
            Build browser and API automations with constrained AI, a visual workflow graph,
            reusable templates, and deterministic execution. Stanley uses AI where judgment
            helps and explicit steps everywhere else.
          </p>

          <div className="v2-hero-actions">
            <button onClick={handleLaunchClick} className="v2-btn v2-btn-hero">
              <span>Launch Dashboard</span>
              <Zap size={20} />
              <span className="v2-pulse-ring" />
            </button>
            <a href="#how-it-works" className="v2-btn v2-btn-outline">
              See How It Works
              <ArrowRight size={18} />
            </a>
          </div>

          <p className="v2-hero-note">
            <Lock size={14} />
            First 10 successful runs are free. No credit card required.
          </p>
        </div>
      </section>

      <div className="v2-divider" />

      {/* ── Features Bento Grid ───────────────────────────────── */}
      <section id="features" className="v2-section">
        <div className="v2-section-header scroll-reveal">
          <h2>Built for Reliable Operations</h2>
          <p>
            Use the right execution layer for each job: browser actions, native integrations,
            generated connectors, or bounded AI agents.
          </p>
        </div>

        <div className="v2-bento">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`v2-bento-card scroll-reveal delay-${(i % 3) + 1}${f.wide ? ' v2-bento-wide' : ''}`}
            >
              <div className={`v2-feature-icon ${f.accent}`}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="v2-divider" />

      {/* ── How It Works ──────────────────────────────────────── */}
      <section id="how-it-works" className="v2-section">
        <div className="v2-section-header scroll-reveal">
          <h2>How Stanley Works</h2>
          <p>From natural-language intent to a constrained, inspectable, and repeatable automation.</p>
        </div>

        <div className="v2-steps scroll-reveal">
          {steps.map((s) => (
            <div key={s.num} className="v2-step">
              <div className="v2-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="v2-divider" />

      {/* ── Comparison Table ──────────────────────────────────── */}
      <section className="v2-section">
        <div className="v2-section-header scroll-reveal">
          <h2>Why Hybrid Automation Matters</h2>
          <p>Stanley combines explicit workflow control with AI only where flexible judgment adds value.</p>
        </div>

        <div className="v2-compare scroll-reveal">
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th className="v2-highlight">Stanley</th>
                <th>Single-mode automation</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr key={c.cap}>
                  <td>{c.cap}</td>
                  <td className="v2-highlight">
                    <CheckCircle2 size={15} className="v2-check" />
                    {c.stanley}
                  </td>
                  <td className="v2-dim">{c.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="v2-divider" />

      {/* ── Pricing ───────────────────────────────────────────── */}
      <section id="pricing" className="v2-pricing">
        <div className="v2-aurora" />
        <div className="v2-pricing-content scroll-reveal">
          <h2>Get Stanley Today</h2>
          <p className="v2-pricing-sub">
            Build reusable browser and API automations with constrained AI and visible control.
          </p>
          <div className="v2-price">
            <span className="v2-price-amount">$25</span>
            <span className="v2-price-period">/ Month</span>
          </div>
          <a
            href="https://buy.stripe.com/fZueVe9S38SV8fF38K3cc01"
            target="_blank"
            rel="noopener noreferrer"
            className="v2-btn v2-btn-hero"
          >
            <span>Subscribe Now</span>
            <Zap size={20} />
            <span className="v2-pulse-ring" />
          </a>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="v2-footer">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <p>&copy; {new Date().getFullYear()} Project Stanley. All rights reserved.</p>
          <Link to="/privacy" style={{ color: 'var(--v2-text-muted)', fontSize: '0.75rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--v2-text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--v2-text-muted)'}>Privacy Policy & Children's Protection</Link>
        </div>
      </footer>

      {/* ── Login Modal ───────────────────────────────────────── */}
      {showLoginModal && (
        <div className="v2-modal-overlay">
          <div className="v2-modal">
            <button
              className="v2-modal-close"
              onClick={() => { setShowLoginModal(false); setLoginError(''); }}
            >
              <X size={20} />
            </button>

            <div className="v2-modal-header">
              <div className="v2-modal-icon">
                <Lock size={24} />
              </div>
              <h2>{modalMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h2>
              <p>{modalMode === 'signin' ? 'Sign in to access the Stanley Cockpit.' : 'Get 10 free runs, no credit card required.'}</p>
            </div>

            <form onSubmit={modalMode === 'signin' ? handleLoginSubmit : handleSignUpSubmit}>
              {loginError && (
                <div className="v2-login-error">
                  <AlertCircle size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="v2-form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div className="v2-form-group">
                <label>
                  Password
                  {modalMode === 'signup' && (
                    <span style={{ color: 'var(--v2-text-muted)', fontWeight: 400 }}> (min. 6 characters)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {modalMode === 'signup' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '1rem 0 1.5rem 0' }}>
                  <input
                    type="checkbox"
                    id="age-certification"
                    required
                    style={{ marginTop: '3px', width: 'auto', cursor: 'pointer' }}
                  />
                  <label htmlFor="age-certification" style={{ fontSize: '0.75rem', color: 'var(--v2-text-secondary)', cursor: 'pointer', lineHeight: '1.4' }}>
                    I certify that I am at least 13 years of age and agree to the <Link to="/privacy" target="_blank" style={{ color: 'var(--v2-violet)', textDecoration: 'underline' }}>Privacy Policy</Link>.
                  </label>
                </div>
              )}

              <button type="submit" className="v2-btn v2-btn-hero v2-btn-full" disabled={isSubmitting}>
                {isSubmitting
                  ? (modalMode === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (modalMode === 'signin' ? 'Sign In' : 'Create Account')}
              </button>

              <div className="v2-modal-switch">
                {modalMode === 'signin' ? (
                  <>
                    Don't have an account?{' '}
                    <button type="button" onClick={() => switchMode('signup')}>
                      Create one for free →
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('signin')}>
                      Sign in instead
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
