import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Activity, KeyRound, Settings, Search, Bell, LogOut, CreditCard, BookOpen, Database, Plus, Zap, LayoutTemplate, Sparkles, Plug, ShieldAlert, BrainCircuit, Menu, X } from 'lucide-react';
import { ExceptionNavBadge } from '../../GPT-Additions/website-overlay/ExceptionNavBadge';
import { toast } from 'sonner';
import { listDocs } from '../../src/lib/firestore';
import { CommandPalette } from '../../src/components/CommandPalette';
import { getUsageStatus, FREE_RUN_LIMIT } from '../../src/lib/usageLimit';
import type { UsageStatus } from '../../src/lib/usageLimit';
import './LayoutV2.css';
import './dashboard-v2.css';

const mobileDestinationsV2 = [
  { name: 'Stanley', path: '/dashboard', icon: Sparkles },
  { name: 'Automations', path: '/dashboard/canvas', icon: Activity },
  { name: 'Activity', path: '/dashboard/results', icon: Database },
  { name: 'Inbox', path: '/dashboard/exceptions', icon: ShieldAlert },
  { name: 'You', path: '/dashboard/settings', icon: Settings },
];

export function LayoutV2({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [usageStatus, setUsageStatus] = useState<UsageStatus>({ isPaid: false, runsUsed: 0, remaining: FREE_RUN_LIMIT });
  
  // Notifications State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Welcome to Stanley V2! Click 'Guide' in the sidebar to learn how to draw flows.", time: "1 day ago" },
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
    { name: 'Operations', path: '/dashboard/operations', icon: BrainCircuit },
    { name: 'Connectors', path: '/dashboard/connectors', icon: Plug },
    { name: 'Exceptions', path: '/dashboard/exceptions', icon: ShieldAlert },
    { name: 'Guide', path: '/dashboard/guide', icon: BookOpen },
    { name: 'Templates', path: '/dashboard/templates', icon: LayoutTemplate },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  const isMobileDestinationActive = (name: string, path: string) => {
    if (name === 'Stanley') return location.pathname === '/dashboard';
    if (name === 'Automations') return ['/dashboard/automations', '/dashboard/templates', '/dashboard/canvas', '/dashboard/editor', '/dashboard/connectors'].some((candidate) => location.pathname.startsWith(candidate));
    if (name === 'Activity') return location.pathname.startsWith('/dashboard/results');
    if (name === 'Inbox') return location.pathname.startsWith('/dashboard/exceptions');
    if (name === 'You') return ['/dashboard/account', '/dashboard/vault', '/dashboard/operations', '/dashboard/guide', '/dashboard/settings'].some((candidate) => location.pathname.startsWith(candidate));
    return location.pathname === path;
  };

  return (
    <div className="landing-v2 dashboard-v2 flex h-[100dvh] w-screen font-sans overflow-hidden select-none">
      
      {/* Animated mesh gradient background */}
      <div className="v2-mesh" style={{ opacity: 0.7 }}>
        <div className="v2-orb v2-orb-1" style={{ width: '400px', height: '400px', filter: 'blur(100px)' }} />
        <div className="v2-orb v2-orb-2" style={{ width: '300px', height: '300px', filter: 'blur(80px)' }} />
      </div>

      {/* Sidebar */}
      <aside className="v2-sidebar hidden md:flex w-[240px] border-r flex-col justify-between p-4 shrink-0 z-20">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <img src="/favicon.svg" alt="Stanley" className="w-8 h-8" />
            <span className="v2-brand-name font-bold text-base tracking-tight">Stanley</span>
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
                  className={`v2-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive ? 'active' : ''
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                  {item.name === 'Exceptions' && <ExceptionNavBadge />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-4 border-t pt-4 v2-sidebar-footer">

          {/* Free-tier run counter — only for non-paid users */}
          {!usageStatus.isPaid && (
            <div className="px-3 py-2.5 rounded-xl v2-usage-card">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Free Runs</span>
                <span className="text-[10px] font-bold">{usageStatus.runsUsed} / {FREE_RUN_LIMIT}</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden v2-progress-bg">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (usageStatus.runsUsed / FREE_RUN_LIMIT) * 100)}%`,
                    background: usageStatus.runsUsed >= FREE_RUN_LIMIT
                      ? 'linear-gradient(90deg, #ef4444, #f97316)'
                      : 'linear-gradient(90deg, var(--v2-violet), var(--v2-cyan))'
                  }}
                />
              </div>
              {usageStatus.runsUsed >= FREE_RUN_LIMIT && (
                <a
                  href="https://buy.stripe.com/fZueVe9S38SV8fF38K3cc01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[10px] font-bold text-white transition-all hover:scale-[1.02] v2-btn-upgrade"
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
            className="v2-billing-link flex items-center gap-3 px-3 py-2 text-xs font-semibold transition-colors"
          >
            <CreditCard size={16} />
            <span>Manage Billing</span>
          </a>
          
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors bg-transparent border-none cursor-pointer">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
          
          <div className="flex items-center gap-3 px-3 py-2 mt-2 v2-user-profile">
            <div className="w-8 h-8 rounded-full flex items-center justify-center v2-avatar-bg">
              <span className="text-xs font-bold">JD</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">User Account</p>
              <p className="text-[10px] text-slate-400">{usageStatus.isPaid ? 'Pro Plan' : 'Free Plan'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 v2-main-area">
        <header className="v2-topbar h-16 border-b px-4 sm:px-6 flex items-center justify-between backdrop-blur-md shrink-0 z-40">
          <div className="md:hidden flex items-center gap-2.5 min-w-0">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="v2-mobile-icon-button" aria-label="Open all Stanley tools">
              <Menu size={20} />
            </button>
            <button type="button" onClick={() => navigate('/dashboard-v2')} className="flex items-center gap-2 min-w-0" aria-label="Open Stanley home">
              <img src="/favicon.svg" alt="" className="w-7 h-7" />
              <span className="font-bold text-sm text-slate-200 truncate">Stanley</span>
            </button>
          </div>

          <div className="hidden md:block relative w-96 cursor-pointer" onClick={() => setPaletteOpen(true)}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search automations, actions... (⌘K)" 
              readOnly
              className="w-full rounded-xl pl-9 pr-16 py-1.5 text-xs focus:outline-none cursor-pointer v2-search-input"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded v2-cmd-badge">⌘K</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4">
            <button type="button" onClick={() => setPaletteOpen(true)} className="v2-mobile-icon-button md:hidden" aria-label="Search Stanley">
              <Search size={18} />
            </button>
            {/* Interactive Notifications Bell */}
            <div className="relative">
              <button 
                onClick={toggleNotifications}
                className="relative p-2 text-slate-400 hover:text-slate-350 transition-colors cursor-pointer bg-transparent border-none"
              >
                <Bell size={18} />
                {hasUnread && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse-soft" style={{ background: 'var(--v2-violet)' }} />
                )}
              </button>
              
              {notificationsOpen && (
                <div 
                  className="fixed sm:absolute right-3 sm:right-0 left-3 sm:left-auto mt-2 sm:w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-4 text-left v2-notifications-dropdown"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-2">
                    <span className="text-xs font-bold text-slate-200">Notifications</span>
                    {notifications.length > 0 && (
                      <button 
                        onClick={handleClearNotifications}
                        className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 cursor-pointer bg-transparent border-none"
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
                        <div key={n.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 transition-colors">
                          <p className="text-xs text-slate-300 leading-snug">{n.text}</p>
                          <span className="text-[9px] text-slate-500 block mt-1">{n.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                if (location.pathname === '/dashboard-v2/canvas') {
                  window.dispatchEvent(new CustomEvent('new-automation'));
                } else {
                  navigate('/dashboard-v2');
                  window.dispatchEvent(new CustomEvent('reset-workspace'));
                }
              }}
              className="flex min-h-10 items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer v2-btn-new"
            >
              <Plus size={15} /> <span className="hidden sm:inline">New Automation</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="v2-main flex-1 min-h-0 flex flex-col relative overflow-hidden">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="v2-mobile-nav md:hidden flex items-stretch justify-around border-t shrink-0 z-50" aria-label="Primary mobile navigation">
          {mobileDestinationsV2.map((item) => {
            const Icon = item.icon;
            const isActive = isMobileDestinationActive(item.name, item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`v2-mobile-nav-item flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[9px] font-semibold">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="All Stanley tools">
          <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-[4px]" onClick={() => setMobileMenuOpen(false)} aria-label="Close tools menu" />
          <section className="absolute inset-y-0 left-0 w-[min(88vw,360px)] overflow-y-auto bg-slate-900 border-r border-slate-800 px-4 pb-8 shadow-2xl v2-mobile-drawer" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
            <div className="flex items-center justify-between px-2 pb-4">
              <div className="flex items-center gap-2.5">
                <img src="/favicon.svg" alt="" className="w-8 h-8" />
                <div>
                  <p className="text-sm font-bold text-slate-100">Stanley</p>
                  <p className="text-[10px] text-slate-400">All capabilities</p>
                </div>
              </div>
              <button type="button" className="v2-mobile-icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Close tools menu"><X size={20} /></button>
            </div>
            <nav className="grid grid-cols-1 gap-1" aria-label="All Stanley destinations">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link 
                    key={item.name} 
                    to={item.path} 
                    onClick={() => setMobileMenuOpen(false)} 
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-xs font-semibold v2-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={17} />
                    <span className="flex-1">{item.name}</span>
                    {item.name === 'Exceptions' && <ExceptionNavBadge />}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-5 border-t border-slate-800 pt-4">
              <button type="button" onClick={handleSignOut} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-rose-400 bg-transparent border-none cursor-pointer"><LogOut size={17} /> Sign Out</button>
            </div>
          </section>
        </div>
      )}

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
