import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Cockpit } from './views/Cockpit';
import { Vault } from './views/Vault';
import { Editor } from './views/Editor';
import { Landing } from './views/Landing';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = localStorage.getItem('stanley_logged_in') === 'true';
  return isLoggedIn ? <>{children}</> : <Navigate to="/?login=true" replace />;
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
