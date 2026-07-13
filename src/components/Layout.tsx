import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Activity, KeyRound, Settings, Search, Bell, LogOut, CreditCard, BookOpen, Database, Plus, Zap, LayoutTemplate, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { listDocs } from '../lib/firestore';
import { CommandPalette } from './CommandPalette';
import { getUsageStatus, FREE_RUN_LIMIT } from '../lib/usageLimit';
import type { UsageStatus } from '../lib/usageLimit';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [usageStatus, setUsageStatus] = useState<UsageStatus>({ isPaid: false, runsUsed: 0, remaining: FREE_RUN_LIMIT });
  
  // Notifications State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Welcome to Stanley! Click 'Guide' in the sidebar to learn how to draw flows.", time: "1 day ago" },
    { id: 2, text: "Headless cloud execution engine successfully initialized.", time: "4 hours ago" }
  ]);

  // Fetch workflows list on mount for command palette search
  useEffect(() => {
    listDocs('workflows')
      .then(wfs => setWorkflows(wfs.map((w: any) => ({ id: w.id, name: w.name }))))
      .catch(err => console.error('Failed to fetch workflows for palette:', err));
  }, []);

  // Load free-tier usage status
  useEffect(() => {
    getUsageStatus().then(setUsageStatus).catch(() => {});
  }, []);

  // Global listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close notifications dropdown on click outside
  useEffect(() => {
    if (!notificationsOpen) return;
    const handleOutsideClick = () => setNotificationsOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [notificationsOpen]);

  const handleSignOut = () => {
    localStorage.removeItem('stanley_logged_in');
    navigate('/?login=true');
  };

  const toggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotificationsOpen(!notificationsOpen);
    setHasUnread(false);
  };

  const handleClearNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications([]);
    toast.success('Notifications cleared');
  };


  const navItems = [
    { name: 'Workspace', path: '/dashboard', icon: Sparkles },
    { name: 'Visual Flow', path: '/dashboard/canvas', icon: Activity },
    { name: 'Results', path: '/dashboard/results', icon: Database },
    { name: 'Credential Vault', path: '/dashboard/vault', icon: KeyRound },
    { name: 'Guide', path: '/dashboard/guide', icon: BookOpen },
    { name: 'Templates', path: '/dashboard/templates', icon: LayoutTemplate },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-screen font-sans overflow-hidden select-none" style={{ background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      
      {/* Sidebar */}
      <aside className="w-[240px] border-r flex flex-col justify-between p-4 shrink-0 z-20" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-surface)' }}>
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <img src="/favicon.svg" alt="Stanley" className="w-8 h-8 drop-shadow-md" />
            <span className="font-bold text-base tracking-tight text-slate-800">Stanley</span>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive 
                      ? 'font-bold shadow-sm' 
                      : 'hover:bg-[#EEF1F6]'
                  }`}
                  style={isActive ? { background: 'rgba(108,71,255,0.09)', color: 'var(--accent)', border: '1px solid rgba(108,71,255,0.18)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: 'var(--border-strong)' }}>

          {/* Free-tier run counter — only for non-paid users */}
          {!usageStatus.isPaid && (
            <div className="px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Free Runs</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>{usageStatus.runsUsed} / {FREE_RUN_LIMIT}</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-elevated)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (usageStatus.runsUsed / FREE_RUN_LIMIT) * 100)}%`,
                    background: usageStatus.runsUsed >= FREE_RUN_LIMIT
                      ? 'linear-gradient(90deg, #ef4444, #f97316)'
                      : 'linear-gradient(90deg, #6C47FF, #9F7AEA)'
                  }}
                />
              </div>
              {usageStatus.runsUsed >= FREE_RUN_LIMIT && (
                <a
                  href="https://buy.stripe.com/fZueVe9S38SV8fF38K3cc01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[10px] font-bold text-white transition-all hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #6C47FF, #9F7AEA)' }}
                >
                  <Zap size={10} /> Upgrade to Pro
                </a>
              )}
            </div>
          )}

          <a 
            href="https://billing.stripe.com/p/login/00w9AU7JV3yBdzZdNo3cc00"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-xs font-semibold transition-colors" style={{ color: 'var(--text-secondary)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <CreditCard size={16} />
            <span>Manage Billing</span>
          </a>
          
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-500 transition-colors">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
          
          <div className="flex items-center gap-3 px-3 py-2 mt-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(108,71,255,0.10)', border: '1px solid rgba(108,71,255,0.22)' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>JD</span>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>User Account</p>
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{usageStatus.isPaid ? 'Pro Plan' : 'Free Plan'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ background: 'var(--bg-deep)' }}>
        <header className="h-16 border-b px-6 flex items-center justify-between backdrop-blur-md shrink-0 z-10" style={{ borderColor: 'var(--border-strong)', background: 'rgba(255,255,255,0.92)' }}>
          <div className="relative w-96 cursor-pointer" onClick={() => setPaletteOpen(true)}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search automations, actions... (⌘K)" 
              readOnly
              className="w-full rounded-xl pl-9 pr-16 py-1.5 text-xs focus:outline-none cursor-pointer" style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }}>⌘K</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Interactive Notifications Bell */}
            <div className="relative">
              <button 
                onClick={toggleNotifications}
                className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <Bell size={18} />
                {hasUnread && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse-soft" style={{ background: 'var(--accent)' }} />
                )}
              </button>
              
              {notificationsOpen && (
                <div 
                  className="absolute right-0 mt-2 w-80 bg-white border border-[#D1D7E4] rounded-2xl shadow-xl z-50 p-4 animate-fade-in text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2">
                    <span className="text-xs font-bold text-slate-800">Notifications</span>
                    {notifications.length > 0 && (
                      <button 
                        onClick={handleClearNotifications}
                        className="text-[10px] font-semibold text-[#6C47FF] hover:text-[#5535E0] cursor-pointer bg-transparent border-none"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-6 italic">No new notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors">
                          <p className="text-xs text-slate-750 leading-snug">{n.text}</p>
                          <span className="text-[9px] text-slate-400 block mt-1">{n.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                if (location.pathname === '/dashboard/canvas') {
                  window.dispatchEvent(new CustomEvent('new-automation'));
                } else {
                  navigate('/dashboard');
                  window.dispatchEvent(new CustomEvent('reset-workspace'));
                }
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer" style={{ background: 'var(--accent)', boxShadow: '0 2px 8px rgba(108,71,255,0.28)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
            >
              <Plus size={14} /> New Automation
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
          {children}
        </main>
      </div>

      {/* Global Command Palette dialog */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        workflows={workflows}
        onSelectWorkflow={(id) => {
          navigate(`/dashboard?wf=${id}`);
        }}
        onCanvasAction={(action, param) => {
          navigate(`/dashboard?action=${action}${param ? `&param=${param}` : ''}`);
        }}
      />
    </div>
  );
}
