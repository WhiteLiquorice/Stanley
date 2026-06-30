import { useState, useEffect } from 'react';
import { Plus, Key, Trash2, Loader } from 'lucide-react';
import './Views.css';
import { listDocs, setDoc, deleteDoc } from '../lib/firestore';

interface Secret {
  id: string;
  name: string;
  value: string;
  type: string;
  expires: string;
  status: string;
  username?: string; // for 'Login Credentials' type
  password?: string; // for 'Login Credentials' type
}

const LOGIN_TYPE = 'Login Credentials';

export function Vault() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretType, setSecretType] = useState('API Key');
  const [secretUsername, setSecretUsername] = useState('');
  const [secretPassword, setSecretPassword] = useState('');

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    try {
      setLoading(true);
      const docs = await listDocs('vault');
      setSecrets(docs as unknown as Secret[]);
    } catch (err) {
      console.error('Vault load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = secretType === LOGIN_TYPE;

  const resetForm = () => {
    setSecretName('');
    setSecretValue('');
    setSecretUsername('');
    setSecretPassword('');
    setSecretType('API Key');
  };

  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretName.trim()) return;
    if (isLogin ? (!secretUsername.trim() || !secretPassword.trim()) : !secretValue.trim()) return;

    const newSecret: Secret = {
      id: Math.random().toString(36).substring(2, 9),
      name: secretName,
      // For login credentials, `value` mirrors the username so plain `vault:Name`
      // references still resolve to something sensible; the password is separate.
      value: isLogin ? secretUsername : secretValue,
      type: secretType,
      expires: 'Never',
      status: 'Active',
      ...(isLogin ? { username: secretUsername, password: secretPassword } : {}),
    };

    try {
      await setDoc('vault', newSecret.id, newSecret as unknown as Record<string, unknown>);
      setSecrets([...secrets, newSecret]);
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      console.error('Vault save failed:', err);
      alert('Failed to save secret. Please try again.');
    }
  };

  const handleDeleteSecret = async (id: string) => {
    if (!confirm('Are you sure you want to delete this secret?')) return;
    try {
      await deleteDoc('vault', id);
      setSecrets(secrets.filter(s => s.id !== id));
    } catch (err) {
      console.error('Vault delete failed:', err);
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Credential Vault</h1>
          <p>Securely manage API keys, OAuth tokens, and secrets.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Add New Secret
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><Loader className="spinner"/> Loading credentials...</div>
      ) : secrets.length === 0 ? (
        <div className="empty-state">No credentials found in vault. Add one to secure your APIs!</div>
      ) : (
        <div className="vault-grid">
          {secrets.map((secret) => (
            <div key={secret.id} className="secret-card glass-panel">
              <div className="secret-header">
                <div className="icon-wrapper">
                  <Key size={20} className="text-accent-blue" />
                </div>
                <button className="icon-btn text-accent-danger" onClick={() => handleDeleteSecret(secret.id)} title="Delete Secret">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="secret-body">
                <h3>{secret.name}</h3>
                <p className="secret-type">{secret.type}</p>
                {secret.type === LOGIN_TYPE ? (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                    <div>👤 {secret.username || '—'}</div>
                    <div>vault:{secret.name}.username</div>
                    <div>vault:{secret.name}.password</div>
                  </div>
                ) : (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Value: vault:{secret.name}
                  </div>
                )}
              </div>
              <div className="secret-footer">
                <span className={`status-indicator ${secret.status.toLowerCase()}`}></span>
                <span className="expires-text">{secret.expires}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Secret Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2>Add New Secret</h2>
            <form onSubmit={handleAddSecret}>
              <div className="form-group">
                <label>Secret Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={secretName} 
                  onChange={(e) => setSecretName(e.target.value)} 
                  placeholder="e.g. GitHub Token, Production DB Pass" 
                  required
                />
              </div>
              <div className="form-group">
                <label>Secret Type</label>
                <select className="form-input" value={secretType} onChange={(e) => setSecretType(e.target.value)}>
                  <option>{LOGIN_TYPE}</option>
                  <option>API Key</option>
                  <option>OAuth2 Token</option>
                  <option>Bot Token</option>
                  <option>Password</option>
                </select>
              </div>

              {isLogin ? (
                <>
                  <div className="form-group">
                    <label>Username / Email</label>
                    <input
                      type="text"
                      className="form-input"
                      value={secretUsername}
                      onChange={(e) => setSecretUsername(e.target.value)}
                      placeholder="e.g. you@business.com"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      className="form-input"
                      value={secretPassword}
                      onChange={(e) => setSecretPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '-4px' }}>
                    In a workflow, reference these as <code>vault:{secretName || 'Name'}.username</code> and <code>vault:{secretName || 'Name'}.password</code>.
                  </p>
                </>
              ) : (
                <div className="form-group">
                  <label>Secret Value</label>
                  <input
                    type="password"
                    className="form-input"
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Enter token or password"
                    autoComplete="off"
                    required
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Secret</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
