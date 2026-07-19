import { useState, useEffect } from 'react';
import { Plus, Key, Trash2, Loader, Unplug } from 'lucide-react';

import { listDocs, setDoc, deleteDoc } from '../lib/firestore';
import { connectGoogle, disconnectGoogle, getGoogleConnection, type GoogleConnectionStatus } from '../lib/googleOAuthClient';

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
  const [google, setGoogle] = useState<GoogleConnectionStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    fetchSecrets();
    getGoogleConnection().then(setGoogle).catch(() => setGoogle({ configured: false, connected: false }));
  }, []);

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      if (google?.connected) { await disconnectGoogle(); setGoogle({ ...google, connected: false }); setGoogleBusy(false); }
      else await connectGoogle();
    } catch (error: any) { alert(error.message || 'Could not update the Google connection.'); setGoogleBusy(false); }
  };

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
    <div className="flex flex-col h-full bg-[#FDFBF7] text-[#1C1A17] p-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Credential Vault</h2>
          <p className="text-xs text-slate-500 mt-1">Securely manage API keys, OAuth tokens, and secrets.</p>
        </div>
        <button 
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-600/10 border border-indigo-600/20 transition-all cursor-pointer"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={14} /> Add New Secret
        </button>
      </div>

      <div className="mb-6 bg-white border border-[#EAE6DF] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Google Workspace</h3>
          <p className="text-xs text-slate-500 mt-1">One secure connection for Gmail, Sheets, Calendar, and Drive. Refresh tokens remain server-side.</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider mt-2 ${google?.connected ? 'text-emerald-600' : 'text-slate-400'}`}>{google?.connected ? 'Connected' : google?.configured === false ? 'Needs server configuration' : 'Not connected'}</p>
        </div>
        <button className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${google?.connected ? 'bg-white border border-rose-200 text-rose-600' : 'bg-indigo-600 text-white'}`} onClick={handleGoogle} disabled={googleBusy || google?.configured === false}>
          {googleBusy ? <Loader size={14} className="animate-spin"/> : google?.connected ? <Unplug size={14}/> : <Key size={14}/>}
          {google?.connected ? 'Disconnect Google' : 'Connect Google'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
          <Loader className="w-4 h-4 animate-spin"/> Loading credentials...
        </div>
      ) : secrets.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm border border-[#EAE6DF] rounded-2xl bg-white border-dashed shadow-sm">
          No credentials found in vault. Add one to secure your APIs!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-6">
          {secrets.map((secret) => (
            <div key={secret.id} className="bg-white border border-[#EAE6DF] rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Key size={18} className="text-indigo-600" />
                </div>
                <button 
                  className="text-slate-400 hover:text-rose-500 transition-colors p-1 cursor-pointer"
                  onClick={() => handleDeleteSecret(secret.id)} 
                  title="Delete Secret"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{secret.name}</h3>
                <p className="text-xs text-slate-500 mt-1 font-semibold">{secret.type}</p>
                {secret.type === LOGIN_TYPE ? (
                  <div className="mt-3 font-mono text-[10px] text-slate-600 flex flex-col gap-1 bg-[#F5F2EC]/85 p-2.5 rounded-lg border border-[#EAE6DF]">
                    <div className="text-slate-800">👤 {secret.username || '—'}</div>
                    <div>vault:{secret.name}.username</div>
                    <div>vault:{secret.name}.password</div>
                  </div>
                ) : (
                  <div className="mt-3 font-mono text-[10px] text-slate-600 bg-[#F5F2EC]/85 p-2.5 rounded-lg border border-[#EAE6DF]">
                    Value: vault:{secret.name}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-auto pt-4 border-t border-[#EAE6DF]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${secret.status.toLowerCase() === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{secret.status}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-semibold text-right">Expires: {secret.expires}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Secret Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#EAE6DF] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#EAE6DF] bg-[#FDFBF7]">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add New Secret</h2>
            </div>
            <div className="p-6">
              <form onSubmit={handleAddSecret} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Secret Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-[#F5F2EC] border border-[#EAE6DF] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-xl px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
                    value={secretName} 
                    onChange={(e) => setSecretName(e.target.value)} 
                    placeholder="e.g. GitHub Token, Production DB Pass" 
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Secret Type</label>
                  <select 
                    className="w-full bg-[#F5F2EC] border border-[#EAE6DF] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none transition-all"
                    value={secretType} 
                    onChange={(e) => setSecretType(e.target.value)}
                  >
                    <option>{LOGIN_TYPE}</option>
                    <option>API Key</option>
                    <option>OAuth2 Token</option>
                    <option>Bot Token</option>
                    <option>Password</option>
                  </select>
                </div>

                {isLogin ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username / Email</label>
                      <input
                        type="text"
                        className="w-full bg-[#F5F2EC] border border-[#EAE6DF] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-xl px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
                        value={secretUsername}
                        onChange={(e) => setSecretUsername(e.target.value)}
                        placeholder="e.g. you@business.com"
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
                      <input
                        type="password"
                        className="w-full bg-[#F5F2EC] border border-[#EAE6DF] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-xl px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
                        value={secretPassword}
                        onChange={(e) => setSecretPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Reference as <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">vault:{secretName || 'Name'}.username</code> and <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">vault:{secretName || 'Name'}.password</code>.
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Secret Value</label>
                    <input
                      type="password"
                      className="w-full bg-[#F5F2EC] border border-[#EAE6DF] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-xl px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
                      value={secretValue}
                      onChange={(e) => setSecretValue(e.target.value)}
                      placeholder="Enter token or password"
                      autoComplete="off"
                      required
                    />
                  </div>
                )}

                <div className="flex gap-3 justify-end mt-4">
                  <button 
                    type="button" 
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm font-bold text-white shadow-md shadow-indigo-600/10 transition-colors cursor-pointer"
                  >
                    Save Secret
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
