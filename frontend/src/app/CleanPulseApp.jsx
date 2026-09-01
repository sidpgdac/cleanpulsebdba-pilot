import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/api.js';
import Dashboard from '../pages/Dashboard.jsx';
import Facilities from '../pages/FacilitySetup.jsx';
import Cleaners from '../pages/Cleaners.jsx';
import Complaints from '../pages/Complaints.jsx';
import Cleaning from '../pages/Cleaning.jsx';
import Experience from '../pages/public/QRFlow.jsx';
import ToiletDetailPanel from '../pages/ToiletDetailPanel.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Building2, Users, AlertCircle,
  LogOut, Sun, Moon, ClipboardList, Activity, Radio, PanelLeftClose, PanelLeftOpen, Sparkles
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',  icon: <LayoutDashboard size={16} />, label: 'Dashboard'  },
  { id: 'facilities', icon: <Building2     size={16} />, label: 'Facilities' },
  { id: 'cleaning',   icon: <ClipboardList size={16} />, label: 'Evidence'   },
  { id: 'cleaners',   icon: <Users         size={16} />, label: 'Cleaners'   },
  { id: 'complaints', icon: <AlertCircle   size={16} />, label: 'Complaints' },
];

function LoginPage({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    onSuccess();
  }

  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand-mark light">
          <span>CP</span>
          <div><b>CleanPulse</b><small>BMC HEALTH</small></div>
        </div>
        <div>
          <p>ADMIN COMMAND CENTRE</p>
          <h1>Every Toilet.<br />Always<br />Accountable.</h1>
          <span>Real-time cleanliness monitoring and accountability for every BMC facility.</span>
        </div>
        <div className="login-uptime">
          <small>FACILITY UPTIME</small>
          <strong>96.8<sup style={{ fontSize: 18 }}>%</sup></strong>
          <span>↑ 1.2% vs last week</span>
        </div>
        <footer>BMC CleanPulse · Pilot Programme · BDBA Shatabdi Hospital</footer>
      </div>

      <div className="login-form">
        <div>
          <p>FACILITY ADMINISTRATOR</p>
          <h2>Sign in</h2>
          <span>Command centre access for authorised administrators.</span>
          <form onSubmit={submit}>
            <label>Email address
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@hospital.gov.in" />
            </label>
            <label>Password
              <div className="password-field">
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </label>
            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8, fontSize: '0.8rem', border: '1px solid rgba(242,74,74,0.2)' }}>
                {error}
              </div>
            )}
            <button className="login-button" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in to CleanPulse →'}
            </button>
          </form>
          <p className="security-note">Secured · Role-based access · Audit logged</p>
        </div>
      </div>
    </div>
  );
}

function InvalidScan({ code, onClose }) {
  return (
    <div className="experience-backdrop">
      <div className="invalid-qr">
        <span>×</span>
        <h1>Invalid CleanPulse QR</h1>
        <p><b>{code}</b> is not an active toilet ID.</p>
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function CleanPulseApp() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [toilets, setToilets] = useState([]);
  const [scan, setScan] = useState(null);
  const [toast, setToast] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [openComplaints, setOpenComplaints] = useState(0);
  const [selectedToilet, setSelectedToilet] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('cp-sidebar-collapsed') === 'true');
  const [motionEnabled, setMotionEnabled] = useState(() => localStorage.getItem('cp-motion') !== 'off');

  useEffect(() => {
    localStorage.setItem('cp-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motionEnabled ? 'full' : 'off');
    localStorage.setItem('cp-motion', motionEnabled ? 'full' : 'off');
  }, [motionEnabled]);

  const [theme, setTheme] = useState(() => localStorage.getItem('cp-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cp-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const navigate = useCallback((next) => {
    setView(next);
    setSidebarOpen(false);
  }, []);

  async function loadData(prof) {
    if (!prof?.facility_id) return;
    try {
      const [toiletRes, facRes, feedbackRes] = await Promise.all([
        supabase.from('toilets').select('*').eq('facility_id', prof.facility_id).eq('active', true).order('name'),
        supabase.from('facilities').select('name').eq('id', prof.facility_id).single(),
        supabase.from('feedback').select('id').eq('facility_id', prof.facility_id).eq('status', 'OPEN'),
      ]);
      setToilets(toiletRes.data || []);
      setFacilityName(facRes.data?.name || 'Facility');
      setOpenComplaints((feedbackRes.data || []).length);
    } catch (e) { console.error(e); }
  }

  async function bootstrap() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: p } = await supabase
      .from('profiles')
      .select('id,full_name,role,facility_id,facilities(name)')
      .eq('id', session.user.id)
      .single();
    if (p && (p.role === 'admin' || p.role === 'supervisor')) {
      setProfile(p);
      await loadData(p);
    }
    setLoading(false);
  }

  useEffect(() => { bootstrap(); }, []);

  useEffect(() => {
    if (!profile?.facility_id) return;
    const ch = supabase
      .channel(`cp-admin-${profile.facility_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets',  filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.facility_id]);

  if (loading) {
    return (
      <div className="loadingScreen">
        <div style={{ width: 36, height: 36, border: '3px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <b style={{ fontSize: '0.65rem', letterSpacing: '0.14em', color: '#9ca3af' }}>OPENING CLEANPULSE</b>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!profile) return <LoginPage onSuccess={bootstrap} />;

  const nameWords = (profile.full_name || 'Admin').split(' ');
  const userInitials = nameWords.map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const scannedToilet = scan ? toilets.find(t => t.code === scan || t.id === scan) : null;
  const sharedProps = { toilets, setToilets, notify, facilityId: profile.facility_id, facilityName };

  function renderContent() {
    switch (view) {
      case 'dashboard':
        return <Dashboard {...sharedProps} greeting={greeting} today={today} firstName={nameWords[0]} onNavigate={navigate} onScan={setScan} onToiletsChanged={() => loadData(profile)} onToiletClick={setSelectedToilet} />;
      case 'facilities':
        return <Facilities {...sharedProps} onToiletsChanged={() => loadData(profile)} onToiletClick={setSelectedToilet} />;
      case 'cleaning':
        return <Cleaning facilityId={profile.facility_id} notify={notify} />;
      case 'cleaners':
        return <Cleaners facilityId={profile.facility_id} notify={notify} />;
      case 'complaints':
        return <Complaints facilityId={profile.facility_id} notify={notify} />;
      default:
        return null;
    }
  }

  // Map view to breadcrumb label
  const breadcrumbs = {
    dashboard: 'Dashboard',
    facilities: 'Facilities',
    cleaning: 'Evidence Log',
    cleaners: 'Cleaners',
    complaints: 'Complaints',
  };

  return (
    <div className={`cp-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar overlay for mobile ── */}
      {sidebarOpen && <div className="cp-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ── */}
      <aside className={`cp-sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="cp-sidebar-brand">
          <div className="cp-sidebar-logo"><Activity size={17} /></div>
          <div>
            <div className="cp-brand-name">CleanPulse</div>
            <div className="cp-brand-sub">Operations intelligence</div>
          </div>
          <span className="cp-brand-edition">BMC</span>
        </div>

        <div className="cp-nav-section-label">Command centre</div>
        <nav className="cp-sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`cp-nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span className="cp-nav-icon">{item.icon}</span>
              <span className="cp-nav-label">{item.label}</span>
              {item.id === 'complaints' && openComplaints > 0 && (
                <span className="cp-nav-badge">{openComplaints}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="cp-system-card">
          <div className="cp-system-icon"><Radio size={14} /></div>
          <div><b>Systems operational</b><span>Live facility sync</span></div>
          <i />
        </div>

        <div className="cp-sidebar-footer">
          <div className="cp-user-row">
            <div className="cp-user-avatar">{userInitials}</div>
            <div className="cp-user-info">
              <div className="cp-user-name">{nameWords[0]}</div>
              <div className="cp-user-role">Supervisor</div>
            </div>
          </div>
          <button className="cp-signout" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="cp-main">
        {/* Topbar */}
        <header className="cp-topbar">
          <button className="cp-menu-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Open menu">
            <span /><span /><span />
          </button>

          <button
            className="cp-sidebar-toggle"
            onClick={() => setSidebarCollapsed(value => !value)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={sidebarCollapsed ? 'expand' : 'collapse'}
                initial={{ opacity: 0, rotate: -35, scale: .7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 35, scale: .7 }}
                transition={{ duration: .2 }}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </motion.span>
            </AnimatePresence>
          </button>

          <div className="cp-topbar-breadcrumb">
            <span>CleanPulse</span>
            <span className="cp-tb-sep">/</span>
            <span className="cp-tb-active">{breadcrumbs[view]}</span>
          </div>

          <div className="cp-topbar-right">
            <div className="cp-facility-chip"><Building2 size={13} />{facilityName}</div>
            <button className="cp-icon-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className={`cp-icon-btn cp-motion-btn ${motionEnabled ? 'active' : ''}`}
              onClick={() => setMotionEnabled(value => !value)}
              title={motionEnabled ? 'Turn effects off' : 'Turn effects on'}
              aria-label={motionEnabled ? 'Turn effects off' : 'Turn effects on'}
              aria-pressed={motionEnabled}
            >
              <Sparkles size={15} />
              <span>FX</span>
            </button>
            <div className="cp-user-chip">
              <div className="cp-user-avatar sm">{userInitials}</div>
              <span className="cp-user-chip-name">{nameWords[0]}</span>
            </div>
            <button className="cp-icon-btn cp-logout-btn" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="cp-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 18, scale: .992, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, scale: .995, filter: 'blur(3px)' }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="cp-bottom-nav">
        {NAV.map(item => (
          <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'complaints' && openComplaints > 0 && <em>{openComplaints}</em>}
          </button>
        ))}
      </nav>

      {/* ── Toilet Detail Panel ── */}
      <AnimatePresence>
        {selectedToilet && (
          <ToiletDetailPanel
            key={selectedToilet.id}
            toilet={selectedToilet}
            onClose={() => setSelectedToilet(null)}
            onNavigate={(v) => { navigate(v); setSelectedToilet(null); }}
            notify={notify}
          />
        )}
      </AnimatePresence>

      {/* ── QR scan experience ── */}
      {scan && scannedToilet && (
        <Experience
          toilet={scannedToilet}
          onClose={() => setScan(null)}
          onUpdate={t => { setToilets(ts => ts.map(x => x.id === t.id ? t : x)); setScan(null); }}
          notify={notify}
          demo={true}
        />
      )}
      {scan && !scannedToilet && <InvalidScan code={scan} onClose={() => setScan(null)} />}

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            <span>✓</span>{toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
