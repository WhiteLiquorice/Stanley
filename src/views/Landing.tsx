import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Zap, Lock, Terminal, Activity, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import './Landing.css';

export function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
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
    const isLoggedIn = localStorage.getItem('stanley_logged_in') === 'true';
    if (isLoggedIn) {
      navigate('/dashboard');
    } else {
      setShowLoginModal(true);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');

    if (email === 'asherwright488@gmail.com' && password === 'AW12345!!') {
      localStorage.setItem('stanley_logged_in', 'true');
      setShowLoginModal(false);
      setSearchParams({});
      navigate('/dashboard');
    } else {
      setLoginError('Invalid credentials. Please verify your reviewer email and password.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="landing-page">
      {/* Glow effects for premium dark theme feel */}
      <div className="glow-effect glow-blue"></div>
      <div className="glow-effect glow-teal"></div>

      {/* Navbar */}
      <header className="landing-nav animate-fade-in">
        <div className="logo-area">
          <div className="logo-box">S</div>
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
          <Activity size={14} /> Local Enterprise Automation
        </div>
        
        <h1 className="hero-title animate-fade-in" style={{ animationDelay: '100ms' }}>
          Meet Stanley. The <span className="highlight">bulletproof</span> local web automation butler.
        </h1>
        
        <p className="hero-subtitle animate-fade-in" style={{ animationDelay: '200ms' }}>
          Enterprise-grade browser automation that runs entirely on your machine. 
          Bypass complex anti-bot systems effortlessly using your own residential connection. No proxies required.
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
          <Lock size={14} className="text-accent-green" /> Zero-configuration required. 100% data privacy.
        </p>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="section-header">
          <h2>Built for Reliable Operations</h2>
          <p>Stanley integrates directly with Playwright to execute workflows silently and securely from your own device.</p>
        </div>

        <div className="features-grid">
          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'ip' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'ip' ? null : 'ip')}
          >
            <div className="feature-icon blue">
              <Shield size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Residential IP Safety</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'ip' ? 'rotated' : ''}`} />
            </div>
            <p>Because Stanley runs locally on your machine, it uses your residential internet connection. Evade cloud detection blocks and IP bans without paying for expensive proxies.</p>
            <div className={`feature-drawer ${expandedFeature === 'ip' ? 'open' : ''}`}>
              <div className="drawer-content">
                Standard scrapers route traffic through data centers, which modern websites easily detect and flag. By running natively on your hardware, Stanley leverages your actual internet connection. This makes your automation requests indistinguishable from a real person browsing from home, drastically reducing the occurrence of CAPTCHA challenges and permanent IP blocks.
              </div>
            </div>
          </div>

          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'proxy' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'proxy' ? null : 'proxy')}
          >
            <div className="feature-icon teal">
              <Zap size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Zero Proxy Configuration</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'proxy' ? 'rotated' : ''}`} />
            </div>
            <p>Unlike standard server-side scrapers that require endless configuration, Stanley behaves exactly like a normal human visitor out of the box.</p>
            <div className={`feature-drawer ${expandedFeature === 'proxy' ? 'open' : ''}`}>
              <div className="drawer-content">
                You no longer need to hunt for reliable proxy providers or manage rotating IP pools. Because the automation runs locally in a standard browser environment, the complex and expensive proxy setup usually required for web scraping is completely eliminated. Just launch your workflow and let Stanley do the rest.
              </div>
            </div>
          </div>

          <div 
            className={`feature-card glass-panel interactive-card ${expandedFeature === 'daemon' ? 'expanded' : ''}`}
            onClick={() => setExpandedFeature(expandedFeature === 'daemon' ? null : 'daemon')}
          >
            <div className="feature-icon blue">
              <Terminal size={24} />
            </div>
            <div className="feature-title-row">
              <h3>Secure Local Daemon</h3>
              <ChevronDown size={18} className={`chevron ${expandedFeature === 'daemon' ? 'rotated' : ''}`} />
            </div>
            <p>A secure Chrome Extension interfaces directly with your Node.js daemon using native messaging. Fast, responsive, and completely isolated.</p>
            <div className={`feature-drawer ${expandedFeature === 'daemon' ? 'open' : ''}`}>
              <div className="drawer-content">
                Instead of transmitting your sensitive automation data and credentials to a cloud server, Stanley utilizes a lightweight desktop daemon. The extension communicates directly with this daemon through an encrypted, local-only channel. This architecture ensures your workflows and proprietary data never leave your machine, guaranteeing total privacy and security.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local Architecture (How It Works) */}
      <section id="architecture" className="architecture-section relative border-t border-white/5">
        <div className="section-header">
          <h2>Local Architecture Flow</h2>
          <p>How Stanley securely automates your web actions directly on your machine without cloud servers.</p>
        </div>

        <div className="architecture-grid">
          <div className="arch-card glass-panel">
            <div className="arch-step-badge">1</div>
            <h3>1. Request in Extension</h3>
            <p>Enter your task inside the sandboxed Chrome Extension popup interface.</p>
          </div>

          <div className="arch-card glass-panel">
            <div className="arch-step-badge">2</div>
            <h3>2. Native Messaging Pipe</h3>
            <p>The extension passes user intents directly to the local Node.js daemon executable using Chrome's secure stdio messaging host.</p>
          </div>

          <div className="arch-card glass-panel">
            <div className="arch-step-badge">3</div>
            <h3>3. Playwright Automation</h3>
            <p>The daemon spins up a local Chromium browser window to execute actions quietly using your residential IP, evading cloud detection blocks.</p>
          </div>
        </div>
      </section>

      {/* Feature Matrix Section */}
      <section id="matrix" className="matrix-section">
        <div className="section-header">
          <h2>How Stanley Outperforms Server Automation</h2>
          <p>See why running a local digital butler is safer than deploying scraping servers.</p>
        </div>

        <div className="matrix-container glass-panel">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="highlight-col">Project Stanley (Local Daemon)</th>
                <th>Standard Cloud Scraper (Server)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>IP Reputation / Block Rate</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Excellent (Residential IP)</td>
                <td className="negative">Poor (Cloud Data Center IPs)</td>
              </tr>
              <tr>
                <td>CAPTCHA / Cloudflare Bypasses</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Native solver & manual bypass support</td>
                <td className="negative">Requires expensive solving APIs</td>
              </tr>
              <tr>
                <td>Data Privacy</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> 100% private (never leaves machine)</td>
                <td className="negative">Third-party server routing</td>
              </tr>
              <tr>
                <td>Interactive Session Support</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Live browser interaction on demand</td>
                <td className="negative">No viewable browser runtime</td>
              </tr>
              <tr>
                <td>Running Cost</td>
                <td className="highlight-col"><CheckCircle2 size={16} className="inline mr-2" /> Flat $25 / Month subscription</td>
                <td className="negative">High monthly API & hosting fees (usually $100+)</td>
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
              Unlock the power of browser automation that runs locally on your computer.
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
            <button className="modal-close" onClick={() => setShowLoginModal(false)}>
              <X size={20} />
            </button>
            <div className="modal-header">
              <div className="modal-icon">
                <Lock size={24} />
              </div>
              <h2>Enterprise Access</h2>
              <p>Sign in to access the Stanley Cockpit.</p>
            </div>
            
            <form onSubmit={handleLoginSubmit} className="login-form">
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
                <label>Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <button type="submit" className="btn-launch w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
