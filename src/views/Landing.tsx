import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Zap, Lock, Workflow, Activity, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import { signIn, signUp, isLoggedIn } from '../lib/firebaseAuth';
import './Landing.css';

export function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [modalMode, setModalMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      setShowLoginModal(true);
    }
  }, [searchParams]);

  const handleLaunchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoggedIn()) {
      navigate('/dashboard');
    } else {
      setShowLoginModal(true);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    const result = await signIn(email.trim(), password);
    if (result.ok) {
      setShowLoginModal(false);
      setSearchParams({});
      navigate('/dashboard');
    } else {
      setLoginError(result.error || 'Sign in failed. Please check your credentials.');
    }
    setIsSubmitting(false);
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    const result = await signUp(email.trim(), password);
    if (result.ok) {
      setShowLoginModal(false);
      setSearchParams({});
      navigate('/dashboard');
    } else {
      setLoginError(result.error || 'Could not create account. Please try again.');
    }
    setIsSubmitting(false);
  };

  const switchMode = (mode: 'signin' | 'signup') => {
    setModalMode(mode);
    setLoginError('');
  };

  return (
    <div className="landing-page">
      {/* Glow effects for premium dark theme feel */}
      <div className="glow-effect glow-blue"></div>
      <div className="glow-effect glow-teal"></div>

      {/* Navbar */}
      <header className="landing-nav animate-fade-in">
        <div className="logo-area" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img src="/favicon.svg" alt="Stanley" style={{ width: '36px', height: '36px', filter: 'drop-shadow(0 2px 8px rgba(168,85,247,0.3))' }} />
          <span className="brand-name">STANLEY</span>
        </div>
        <nav className="nav-links hidden md:flex">
          <a href="#features">Features</a>
          <a href="#architecture">Architecture</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-actions">
          <button onClick={handleLaunchClick} className="btn btn-primary">Open Cockpit</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">
          <Activity size={14} /> AI-guided, deterministic automation
        </div>
        
        <h1 className="hero-title animate-fade-in" style={{ animationDelay: '100ms' }}>
          Tell Stanley the outcome. Get a <span className="highlight">workflow you can inspect</span>.
        </h1>
        
        <p className="hero-subtitle animate-fade-in" style={{ animationDelay: '200ms' }}>
          Build browser and API automations with constrained AI, a visual workflow graph, reusable templates,
          and deterministic execution. Stanley uses AI where judgment helps and explicit steps everywhere else.
        </p>
        
        <div className="hero-cta animate-fade-in" style={{ animationDelay: '300ms' }}>
          <button onClick={handleLaunchClick} className="btn-launch">
            Launch Dashboard <Zap size={20} />
          </button>
          <a href="#architecture" className="btn btn-secondary">
            See How It Works
          </a>
        </div>
        
        <p className="hero-note animate-fade-in" style={{ animationDelay: '400ms' }}>
          <Lock size={14} className="text-accent-green" /> First 10 successful runs are free. No credit card required.
        </p>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="section-header">
          <h2>Built for Reliable Operations</h2>
          <p>Use the right execution layer for each job: browser actions, native integrations, generated connectors, or bounded AI agents.</p>
        </div>

        <div className="features-grid">
          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'workflow' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'workflow' ? null : 'workflow')}
          >
            <div className="feature-icon blue">
              <Workflow size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Constrained AI Workflows</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'workflow' ? 'rotated' : ''}`} />
            </div>
            <p>A Mission defines the outcome while explicit nodes, parameters, branches, and policies constrain how Stanley reaches it.</p>
            <div className={`feature-drawer ${expandedFeature === 'workflow' ? 'open' : ''}`}>
              <div className="drawer-content">
                The model works inside a typed graph with execution limits, credential scopes, checkpoints, and review gates. You can inspect and edit the plan before it runs.
              </div>
            </div>
          </div>

          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'integrations' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'integrations' ? null : 'integrations')}
          >
            <div className="feature-icon teal">
              <Zap size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Universal Integrations</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'integrations' ? 'rotated' : ''}`} />
            </div>
            <p>Use built-in operations when they exist, then generate and approve a connector for APIs Stanley has not seen before.</p>
            <div className={`feature-drawer ${expandedFeature === 'integrations' ? 'open' : ''}`}>
              <div className="drawer-content">
                Connector definitions are versioned and inspected before publication. At run time Stanley executes the approved definition deterministically and resolves scoped credentials on the server.
              </div>
            </div>
          </div>

          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'recovery' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'recovery' ? null : 'recovery')}
          >
            <div className="feature-icon blue">
              <Shield size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Reliable, Reviewable Recovery</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'recovery' ? 'rotated' : ''}`} />
            </div>
            <p>Retries, checkpoints, selector fallbacks, traces, and exception review help failed runs stop safely and recover deliberately.</p>
            <div className={`feature-drawer ${expandedFeature === 'recovery' ? 'open' : ''}`}>
              <div className="drawer-content">
                Exact selectors and semantic locators are tried before vision. Learned selector changes become reviewable proposals, and risky or ambiguous work can be routed to the exception workbench instead of silently continuing.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local Architecture (How It Works) */}
      <section id="architecture" className="architecture-section relative border-t border-white/5">
        <div className="section-header">
          <h2>How Stanley Works</h2>
          <p>From natural-language intent to a constrained, inspectable, and repeatable automation.</p>
        </div>

        <div className="architecture-grid">
          <div className="arch-card glass-panel">
            <div className="arch-step-badge">1</div>
            <h3>1. Define the Mission</h3>
            <p>Start from a template, describe an outcome to Copilot, or build directly in the visual workflow editor.</p>
          </div>

          <div className="arch-card glass-panel">
            <div className="arch-step-badge">2</div>
            <h3>2. Inspect the Plan</h3>
            <p>Review the generated nodes, parameters, branches, integrations, permissions, and execution limits before saving.</p>
          </div>

          <div className="arch-card glass-panel">
            <div className="arch-step-badge">3</div>
            <h3>3. Execute and Verify</h3>
            <p>Stanley's cloud runner executes browser or API steps, records evidence, checkpoints progress, and surfaces exceptions for review.</p>
          </div>
        </div>
      </section>

      {/* Feature Matrix Section */}
      <section id="matrix" className="matrix-section">
        <div className="section-header">
          <h2>Why Hybrid Automation Matters</h2>
          <p>Stanley combines explicit workflow control with AI only where flexible judgment adds value.</p>
        </div>

        <div className="matrix-container glass-panel">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="highlight-col">Stanley</th>
                <th>Single-mode automation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Workflow creation</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Natural language, templates, and visual editing</td>
                <td className="negative">Usually manual or prompt-only</td>
              </tr>
              <tr>
                <td>Execution strategy</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Browser, native API, generated connector, and agent nodes</td>
                <td className="negative">One execution mode</td>
              </tr>
              <tr>
                <td>AI control</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Mission, policy, step, and approval constraints</td>
                <td className="negative">Unconstrained prompts or no AI</td>
              </tr>
              <tr>
                <td>Failure handling</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Retries, checkpoints, evidence, and exception review</td>
                <td className="negative">Basic retry or stop</td>
              </tr>
              <tr>
                <td>Extensibility</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Versioned connectors and reusable templates</td>
                <td className="negative">Fixed catalog or one-off scripts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing-section">
        <div className="pricing-card glass-panel relative overflow-hidden">
          <div className="glow-effect pricing-glow"></div>
          
          <div className="relative z-10">
            <h2 className="pricing-title">Get Stanley Today</h2>
            <p className="pricing-subtitle">
              Build reusable browser and API automations with constrained AI and visible control.
            </p>

            <div className="pricing-amount">
              <span className="price">$25</span>
              <span className="period">/ Month</span>
            </div>

            <a href="https://buy.stripe.com/fZueVe9S38SV8fF38K3cc01" target="_blank" rel="noopener noreferrer" className="btn-subscribe">
              <span>Subscribe Now</span>
              <Zap size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} Project Stanley. All rights reserved.</p>
      </footer>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content glass-panel">
            <button className="modal-close" onClick={() => { setShowLoginModal(false); setLoginError(''); }}>
              <X size={20} />
            </button>
            <div className="modal-header">
              <div className="modal-icon">
                <Lock size={24} />
              </div>
              <h2>{modalMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h2>
              <p>{modalMode === 'signin' ? 'Sign in to access the Stanley Cockpit.' : 'Get 10 free runs, no credit card required.'}</p>
            </div>
            
            <form onSubmit={modalMode === 'signin' ? handleLoginSubmit : handleSignUpSubmit} className="login-form">
              {loginError && (
                <div className="login-error">
                  <AlertCircle size={16} />
                  <span>{loginError}</span>
                </div>
              )}
              
              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="youremail@domain.com"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Password{modalMode === 'signup' && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> (min. 6 characters)</span>}</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <button type="submit" className="btn-launch w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? (modalMode === 'signin' ? 'Signing in...' : 'Creating account...')
                  : (modalMode === 'signin' ? 'Sign In' : 'Create Account')}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                {modalMode === 'signin' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      style={{ color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                    >
                      Create one for free →
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      style={{ color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                    >
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
