import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { isLoggedIn, getFreshIdToken, signOut } from './lib/firebaseAuth';
import { CreditCard } from 'lucide-react';

const namedRoute = <T extends Record<string, unknown>, K extends keyof T>(loader: () => Promise<T>, name: K) =>
  lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));

const Cockpit = namedRoute(() => import('./views/Cockpit'), 'Cockpit');
const Workspace = namedRoute(() => import('./views/Workspace'), 'Workspace');
const Vault = namedRoute(() => import('./views/Vault'), 'Vault');
const Results = namedRoute(() => import('./views/Results'), 'Results');
const Guide = namedRoute(() => import('./views/Guide'), 'Guide');
const Templates = namedRoute(() => import('./views/Templates'), 'Templates');
const Landing = namedRoute(() => import('./views/Landing'), 'Landing');
const AdStaging = namedRoute(() => import('./views/AdStaging'), 'AdStaging');
const LandingV2 = namedRoute(() => import('../PROTOTYPES/landing-v2/LandingV2'), 'LandingV2');
const Privacy = namedRoute(() => import('./views/Privacy'), 'Privacy');
const ConnectorWorkbench = namedRoute(() => import('../GPT-Additions/connector-workbench/ConnectorWorkbench'), 'ConnectorWorkbench');
const ExceptionWorkbench = namedRoute(() => import('../GPT-Additions/exception-workbench/ExceptionWorkbench'), 'ExceptionWorkbench');
const OperationsWorkbench = namedRoute(() => import('../GPT-Additions/operations-workbench/OperationsWorkbench'), 'OperationsWorkbench');
const AutomationsHub = namedRoute(() => import('./views/MobileHubs'), 'AutomationsHub');
const AccountHub = namedRoute(() => import('./views/MobileHubs'), 'AccountHub');

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
    <>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f1f5f9',
            fontSize: '13px',
          },
        }}
      />
      <Suspense fallback={<div className="view-container" aria-live="polite">Loading Stanley…</div>}>
        <Routes>
          {/* Public Redesigned Marketing Route (V2) */}
          <Route path="/" element={<LandingV2 />} />
          <Route path="/ad-staging" element={<AdStaging />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Legacy Marketing Route */}
          <Route path="/legacy" element={<Landing />} />

          {/* Dashboard Routes wrapped in the original light Layout */}
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Workspace /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/canvas" element={<ProtectedRoute><Layout><Cockpit /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/vault" element={<ProtectedRoute><Layout><Vault /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/editor" element={<Navigate to="/dashboard/canvas" replace />} />
          <Route path="/dashboard/results" element={<ProtectedRoute><Layout><Results /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/guide" element={<ProtectedRoute><Layout><Guide /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/templates" element={<ProtectedRoute><Layout><Templates /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/automations" element={<ProtectedRoute><Layout><AutomationsHub /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/account" element={<ProtectedRoute><Layout><AccountHub /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/connectors" element={<ProtectedRoute><Layout><ConnectorWorkbench /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/exceptions" element={<ProtectedRoute><Layout><ExceptionWorkbench /></Layout></ProtectedRoute>} />
          <Route path="/dashboard/operations" element={<ProtectedRoute><Layout><OperationsWorkbench /></Layout></ProtectedRoute>} />
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
      </Suspense>
    </>
  );
}

export default App;
