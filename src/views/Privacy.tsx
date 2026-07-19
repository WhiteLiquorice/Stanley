import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Mail, AlertTriangle } from 'lucide-react';
import '../views/Landing.css'; // Leverage styles if needed, or V2 prototype styles

export function Privacy() {
  const navigate = useNavigate();

  // Set the body background color to match the landing-v2 theme
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0C1425';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  return (
    <div className="landing-v2 min-h-screen text-slate-100 font-sans relative overflow-y-auto" style={{ background: '#0C1425' }}>
      
      {/* Mesh Background */}
      <div className="v2-mesh" style={{ opacity: 0.5 }}>
        <div className="v2-orb v2-orb-1" style={{ top: '-10%', left: '-10%', width: '500px', height: '500px', background: 'rgba(139, 92, 246, 0.12)' }} />
        <div className="v2-orb v2-orb-2" style={{ top: '40%', right: '-10%', width: '400px', height: '400px', background: 'rgba(6, 182, 212, 0.08)' }} />
      </div>

      {/* Header / Nav */}
      <header className="v2-nav" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div className="v2-nav-inner" style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem 2rem' }}>
          <button 
            onClick={() => navigate('/')} 
            className="v2-btn v2-btn-outline v2-btn-sm"
            style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ArrowLeft size={14} /> Back to Home
          </button>
          <div className="v2-logo" onClick={() => navigate('/')}>
            <img src="/favicon.svg" alt="Stanley" style={{ width: '28px', height: '28px' }} />
            <span style={{ fontSize: '1.1rem' }}>STANLEY</span>
          </div>
        </div>
      </header>

      {/* Content Container */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '4rem 2rem 6rem', position: 'relative', zIndex: 10 }}>
        
        {/* Title */}
        <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <div className="v2-badge" style={{ marginBottom: '1rem', background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <ShieldCheck size={14} style={{ color: '#C4B5FD', marginRight: '4px' }} /> Legal & Compliance
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#F1F5F9' }}>Privacy Policy</h1>
          <p style={{ color: '#94A3B8', marginTop: '0.5rem', fontSize: '0.9rem' }}>Last updated: July 19, 2026</p>
        </div>

        {/* COPPA Warning Box */}
        <div 
          className="glass-panel" 
          style={{ 
            background: 'rgba(239, 68, 68, 0.04)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '12px', 
            padding: '1.5rem', 
            marginBottom: '2.5rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start'
          }}
        >
          <AlertTriangle size={24} style={{ color: '#F87171', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ margin: '0 0 0.35rem 0', color: '#F87171', fontSize: '0.95rem', fontWeight: 700 }}>COPPA Compliance Notice (Under 13 Restriction)</h3>
            <p style={{ margin: 0, color: '#FCA5A5', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Project Stanley is strictly restricted to individuals who are 13 years of age or older. We do not knowingly target, solicit, or collect personal information from children under 13. If you are under 13, you may not register for an account or use our browser and API automation tools.
            </p>
          </div>
        </div>

        {/* Policy Body */}
        <div style={{ color: '#94A3B8', fontSize: '0.92rem', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <section>
            <h2 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>1. Overview</h2>
            <p>
              Project Stanley ("we", "us", or "our") respects your privacy. This Privacy Policy describes how we collect, use, and safeguard personal information when you visit our website, register for an account, or use our browser and API automation cockpit.
            </p>
          </section>

          <section>
            <h2 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>2. Age Limit (Children Under 13)</h2>
            <p>
              In compliance with the Children's Online Privacy Protection Act (COPPA), Project Stanley does not knowingly collect, retain, or process personal data from children under the age of 13.
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Strict Prohibition:</strong> Registration is restricted to users 13 years and older. During registration, users are required to certify their age.</li>
              <li><strong>Parental Purge Requests:</strong> If you are a parent or guardian and believe that your child under the age of 13 has registered or provided personal information to us, please contact us immediately at <a href="mailto:support@projectstanley.com" style={{ color: '#C4B5FD', textDecoration: 'none' }}>support@projectstanley.com</a>. Upon verification, we will permanently delete the associated account and purge all stored data within 24 hours.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>3. Information We Collect</h2>
            <p>
              To provide the automation service, we collect the following types of information:
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Account Credentials:</strong> Email addresses and login credentials to verify and authenticate your access.</li>
              <li><strong>Automation Secrets:</strong> Secure API keys or login credentials you choose to store in the Credential Vault. All vault credentials are encrypted at rest.</li>
              <li><strong>Execution Logs:</strong> Details of your workflow runs, including selector fallbacks, run steps, run timestamps, and evidence records (e.g. error screenshots) to assist you with debugging.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>4. Data Security</h2>
            <p>
              We implement robust security measures to protect your account and automation data. Stored vault credentials are secure, and browser runners operate in isolated sandbox environments to prevent credential leakage.
            </p>
          </section>

          <section>
            <h2 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>5. Contact & Support</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <Mail size={16} style={{ color: '#C4B5FD' }} />
              <span>For questions, parents' requests, or data erasure requests, contact us at:</span>
            </div>
            <p style={{ marginTop: '0.5rem' }}>
              <a href="mailto:support@projectstanley.com" style={{ color: '#C4B5FD', textDecoration: 'none', fontWeight: 600 }}>support@projectstanley.com</a>
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="v2-footer" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', padding: '2rem 1rem' }}>
        <p style={{ fontSize: '0.8rem', color: '#64748B' }}>&copy; {new Date().getFullYear()} Project Stanley. All rights reserved.</p>
      </footer>

    </div>
  );
}
