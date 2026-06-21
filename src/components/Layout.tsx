import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, KeyRound, Network, Settings, Search, Bell, LogOut } from 'lucide-react';
import './Layout.css'; // We'll create a small css file for layout specifics

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = () => {
    localStorage.removeItem('stanley_logged_in');
    navigate('/?login=true');
  };

  const navItems = [
    { name: 'Cockpit', path: '/dashboard', icon: Activity },
    { name: 'Low-Code Editor', path: '/dashboard/editor', icon: Network },
    { name: 'Credential Vault', path: '/dashboard/vault', icon: KeyRound },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-box">S</div>
          <h2>Stanley</h2>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="sidebar-footer" style={{ marginTop: 'auto', padding: '16px' }}>
          <button onClick={handleSignOut} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--error, #ef4444)' }}>
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Topbar */}
        <header className="topbar glass-panel">
          <div className="search-bar">
            <Search size={18} className="text-secondary" />
            <input type="text" placeholder="Search automations, logs, secrets..." />
          </div>
          <div className="topbar-actions">
            <button className="icon-btn">
              <Bell size={20} />
            </button>
            <div className="avatar">JD</div>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
