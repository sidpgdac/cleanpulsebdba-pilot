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
  LogOut, Sun, Moon, ClipboardList
} from 'lucide-react';

// ─── Navigation items ─────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',  icon: <LayoutDashboard size={15} />, label: 'Dashboard'  },
  { id: 'facilities', icon: <Building2     size={15} />, label: 'Facilities' },
  { id: 'cleaning',   icon: <ClipboardList size={15} />, label: 'Evidence'   },
  { id: 'cleaners',   icon: <Users         size={15} />, label: 'Cleaners'   },
  { id: 'complaints', icon: <AlertCircle   size={15} />, label: 'Complaints' },
];

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
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

// ─── Invalid QR ───────────────────────────────────────────────────────────────
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

// ─── Main App ─────────────────────────────────────────────────────────────────
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

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('cp-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cp-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // ── Notifications ──────────────────────────────────────────────────────────
  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const navigate = useCallback((next) => setView(next), []);

  // ── Data ───────────────────────────────────────────────────────────────────
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

  // Realtime subscriptions
  useEffect(() => {
    if (!profile?.facility_id) return;
    const ch = supabase
      .channel(`cp-admin-${profile.facility_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets',  filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.facility_id]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loadingScreen">
        <div style={{ width: 40, height: 40, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <b style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}>OPENING CLEANPULSE</b>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!profile) return <LoginPage onSuccess={bootstrap} />;

  // ── User info ──────────────────────────────────────────────────────────────
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
        return (
          <Dashboard
            {...sharedProps}
            greeting={greeting} today={today}
            firstName={nameWords[0]}
            onNavigate={navigate}
            onScan={setScan}
            onToiletsChanged={() => loadData(profile)}
            onToiletClick={setSelectedToilet}
          />
        );
      case 'facilities':
        return (
          <Facilities
            {...sharedProps}
            onToiletsChanged={() => loadData(profile)}
            onToiletClick={setSelectedToilet}
          />
        );
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

  return (
    <div className="app-shell">
      {/* ══════════════════════════════════════════════════════════
          TOP NAVIGATION BAR
          ══════════════════════════════════════════════════════════ */}
      <header className="topbar">
        {/* Brand */}
        <div className="topbar-brand">
          <div className="topbar-logo">CP</div>
          <div>
            <span>CleanPulse</span>
            <small>BMC HEALTH</small>
          </div>
        </div>

        <div className="topbar-divider" />
        <span className="topbar-facility">{facilityName}</span>

        {/* Nav pills — desktop */}
        <nav className="topbar-nav" aria-label="Main navigation">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-pill ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              {item.icon}
              {item.label}
              {item.id === 'complaints' && openComplaints > 0 && (
                <span className="nav-badge">{openComplaints}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="topbar-end">
          {/* Theme toggle */}
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User chip */}
          <div className="user-chip">
            <div className="user-avatar">{userInitials}</div>
            <span className="user-chip-name">{nameWords[0]}</span>
          </div>

          {/* Sign out */}
          <button className="signout-btn" title="Sign out" aria-label="Sign out"
            onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          WORKSPACE
          ══════════════════════════════════════════════════════════ */}
      <main className="workspace">
        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MOBILE BOTTOM NAV
          ══════════════════════════════════════════════════════════ */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.map(item => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => navigate(item.id)}
          >
            {item.icon}
            {item.label}
            {item.id === 'complaints' && openComplaints > 0 && (
              <em className="mobile-badge">{openComplaints}</em>
            )}
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
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            <span>✓</span>{toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
