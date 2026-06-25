import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Cockpit } from './views/Cockpit';
import { Vault } from './views/Vault';
import { Editor } from './views/Editor';
import { Landing } from './views/Landing';
import { isLoggedIn, getFreshIdToken, signOut } from './lib/firebaseAuth';
import { CreditCard } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // 'denied' redirects to login; otherwise render optimistically while we refresh
  // the token in the background, flipping to 'denied' only on a hard auth failure.
  const [denied, setDenied] = useState(!isLoggedIn());

  useEffect(() => {
    let active = true;
    if (!isLoggedIn()) {
      setDenied(true);
      return;
    }
    getFreshIdToken().then((token) => {
      if (!active) return;
      if (!token) {
        signOut();
        setDenied(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return denied ? <Navigate to="/?login=true" replace /> : <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public Marketing Route */}
      <Route path="/" element={<Landing />} />
      
      {/* Dashboard Routes wrapped in Layout */}
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Cockpit /></Layout></ProtectedRoute>} />
      <Route path="/dashboard/vault" element={<ProtectedRoute><Layout><Vault /></Layout></ProtectedRoute>} />
      <Route path="/dashboard/editor" element={<ProtectedRoute><Layout><Editor /></Layout></ProtectedRoute>} />
      <Route path="/dashboard/settings" element={
        <ProtectedRoute>
          <Layout>
            <div className="view-container">
              <h1>Settings</h1>
              
              <div className="glass-panel" style={{ padding: '24px', marginTop: '24px', maxWidth: '600px', borderRadius: '12px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>Billing & Subscription</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                  Manage your subscription plan, update payment methods, view invoice history, and download billing receipts via our secure Stripe customer portal.
                </p>
                <a 
                  href="https://billing.stripe.com/p/login/00w9AU7JV3yBdzZdNo3cc00" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '10px 18px', 
                    borderRadius: '8px', 
                    background: '#635bff', 
                    color: '#ffffff', 
                    textDecoration: 'none', 
                    fontWeight: '500',
                    fontSize: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(99, 91, 255, 0.2)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CreditCard size={18} />
                  <span>Open Customer Portal</span>
                </a>
              </div>
            </div>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
