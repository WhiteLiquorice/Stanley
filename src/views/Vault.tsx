import { useState, useEffect } from 'react';
import { Plus, Key, Trash2, Loader } from 'lucide-react';
import './Views.css';

interface Secret {
  id: string;
  name: string;
  value: string;
  type: string;
  expires: string;
  status: string;
}

export function Vault() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretType, setSecretType] = useState('API Key');

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/vault`);
      setSecrets(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretName.trim() || !secretValue.trim()) return;

    const newSecret: Secret = {
      id: Math.random().toString(36).substring(2, 9),
      name: secretName,
      value: secretValue,
      type: secretType,
      expires: 'Never',
      status: 'Active'
    };

    try {
      const res = await fetch(`${API_URL}/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSecret)
      });
      if (res.ok) {
        setSecrets([...secrets, newSecret]);
        setShowAddModal(false);
        setSecretName('');
        setSecretValue('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSecret = async (id: string) => {
    if (!confirm('Are you sure you want to delete this secret?')) return;
    try {
      const res = await fetch(`${API_URL}/vault/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSecrets(secrets.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error(err);
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
                <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Value: vault:{secret.id}
                </div>
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
                  <option>API Key</option>
                  <option>OAuth2 Token</option>
                  <option>Bot Token</option>
                  <option>Password</option>
                </select>
              </div>
              <div className="form-group">
                <label>Secret Value</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={secretValue} 
                  onChange={(e) => setSecretValue(e.target.value)} 
                  placeholder="Enter token or password" 
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Secret</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
