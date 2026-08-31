import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/api.js';
import { statusMeta } from '../lib/data.js';
import Dashboard from '../pages/Dashboard.jsx';
import Facilities from '../pages/FacilitySetup.jsx';
import Cleaners from '../pages/Cleaners.jsx';
import Complaints from '../pages/Complaints.jsx';
import Experience from '../pages/public/QRFlow.jsx';
import ToiletDetailPanel from '../pages/ToiletDetailPanel.jsx';
import { AnimatePresence } from 'framer-motion';

import { LayoutDashboard, Building2, Users, AlertCircle, LogOut, Sun, Moon } from 'lucide-react';

// ─── Navigation ──────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',   icon: <LayoutDashboard size={18} />, label: 'Dashboard'   },
  { id: 'facilities',  icon: <Building2 size={18} />, label: 'Facilities'  },
  { id: 'cleaners',    icon: <Users size={18} />, label: 'Cleaners'    },
  { id: 'complaints',  icon: <AlertCircle size={18} />, label: 'Complaints'  },
];

// ─── Login ────────────────────────────────────────────────────────────────────
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
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label>Password
              <div className="password-field">
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </label>
            {error && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 8, fontSize: 9 }}>{error}</div>}
            <button className="login-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to CleanPulse →'}</button>
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
        <button className="mobile-primary" onClick={onClose}>Close</button>
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

  // ── Theme ──
  const [theme, setTheme] = useState(() => localStorage.getItem('cp-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cp-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const navigate = useCallback((next) => setView(next), []);

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
    } catch (e) {
      console.error(e);
    }
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

  // Realtime subscription — re-load when any toilet changes
  useEffect(() => {
    if (!profile?.facility_id) return;
    const ch = supabase
      .channel(`cp-admin-${profile.facility_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets', filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.facility_id]);

  // Loading spinner
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 15, background: 'var(--canvas)' }}>
        <div style={{ width: 42, height: 42, border: '3px solid var(--green)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <b style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--muted)' }}>OPENING CLEANPULSE</b>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!profile) return <LoginPage onSuccess={bootstrap} />;

  // User display
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
            greeting={greeting}
            today={today}
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
      case 'cleaners':
        return <Cleaners facilityId={profile.facility_id} notify={notify} />;
      case 'complaints':
        return <Complaints facilityId={profile.facility_id} notify={notify} />;
      case 'cleaning':
        return null; // handled via navigate
      default:
        return null;
    }
  }

  return (
    <main className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand-mark">
          <span>CP</span>
          <div><b>CleanPulse</b><small>BMC HEALTH</small></div>
        </div>

        <nav aria-label="Main navigation">
          {NAV.map(item => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-active' : ''}
              onClick={() => navigate(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === 'complaints' && openComplaints > 0 && <em>{openComplaints}</em>}
            </button>
          ))}
        </nav>

        <div className="side-footer">
          <span className="avatar">{userInitials}</span>
          <div className="profile-button">
            <b>{profile.full_name}</b>
            <small>{profile.role === 'admin' ? 'Admin' : 'Supervisor'} · {facilityName}</small>
          </div>
          <button
            className="theme-toggle"
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
          ><LogOut size={16} /></button>
        </div>
      </aside>

      {/* ── Workspace ── */}
      <section className="workspace">
        <div className="content">
          {renderContent()}
        </div>
      </section>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.map(item => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => navigate(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.id === 'complaints' && openComplaints > 0 && <em className="mobile-badge">{openComplaints}</em>}
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

      {/* ── QR demo experience ── */}
      {scan && scannedToilet && (
        <Experience
          toilet={scannedToilet}
          onClose={() => setScan(null)}
          onUpdate={t => { setToilets(ts => ts.map(x => x.id === t.id ? t : x)); setScan(null); }}
          notify={notify}
          demo={true}
        />
      )}
      {scan && !scannedToilet && (
        <InvalidScan code={scan} onClose={() => setScan(null)} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>{toast}
        </div>
      )}
    </main>
  );
}
