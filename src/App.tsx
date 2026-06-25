import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Cockpit } from './views/Cockpit';
import { Vault } from './views/Vault';
import { Editor } from './views/Editor';
import { Landing } from './views/Landing';
import { isLoggedIn, getFreshIdToken, signOut } from './lib/firebaseAuth';

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
              <p>Platform settings (coming soon)</p>
            </div>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
