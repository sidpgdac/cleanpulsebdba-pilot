import React, { useEffect, useState, useCallback } from 'react';
import { supabase, api } from '../lib/api.js';
import { statusMeta } from '../lib/data.js';
import Overview from '../pages/Overview.jsx';
import LiveStatus from '../pages/LiveStatus.jsx';
import ToiletMaster from '../pages/ToiletMaster.jsx';
import InternalUnits from '../pages/InternalUnits.jsx';
import FacilitySetup from '../pages/FacilitySetup.jsx';
import QRStudio from '../pages/QRStudio.jsx';
import Complaints from '../pages/Complaints.jsx';
import Maintenance from '../pages/Maintenance.jsx';
import Cleaning from '../pages/Cleaning.jsx';
import Audits from '../pages/Audits.jsx';
import Cleaners from '../pages/Cleaners.jsx';
import Users from '../pages/Users.jsx';
import Analytics from '../pages/Analytics.jsx';
import Reports from '../pages/Reports.jsx';
import Settings from '../pages/Settings.jsx';
import Experience from '../pages/public/QRFlow.jsx';

const GROUPS = [
  { label: 'COMMAND', items: [['overview','⌂','Overview'],['live','◎','Live status']] },
  { label: 'OPERATIONS', items: [['cleaning','✦','Cleaning'],['complaints','!','Complaints'],['maintenance','⚒','Maintenance']] },
  { label: 'ASSETS', items: [['facilities','◇','Facilities'],['master','▦','Toilet master'],['units','▤','Internal units'],['qr','⌁','QR Studio']] },
  { label: 'PEOPLE', items: [['cleaners','♙','Cleaners'],['users','♧','Users']] },
  { label: 'QUALITY', items: [['audits','▣','Audits'],['analytics','⌁','Analytics'],['reports','□','Reports']] },
];

const TITLE_MAP = {
  overview:'Command centre',live:'Live status',cleaning:'Cleaning history',
  complaints:'Complaints',maintenance:'Maintenance',facilities:'Facilities',
  master:'Toilet master',units:'Internal units',qr:'QR Studio',cleaners:'Cleaners',
  users:'Users',audits:'Supervisor audits',analytics:'Analytics',reports:'Reports',settings:'Settings',
};

function ToiletDetail({ toilet, onClose, onAudit, onScan, notify }) {
  if (!toilet) return null;
  const units = toilet.units || [];
  const open = units.filter(u => u.operational !== false).length;
  const status = toilet.derived_status === 'NOT_CLEANED' || toilet.derived_status === 'NEEDS_CLEANING' || toilet.derived_status === 'OVERDUE' ? 'alert'
    : toilet.derived_status === 'MAINTENANCE' ? 'maintenance'
    : toilet.derived_status === 'CLEANING' ? 'due'
    : 'clean';
  const sm = statusMeta[status] || statusMeta.clean;
  return (
    <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="detail-drawer">
        <header>
          <div>
            <p>TOILET DETAIL</p>
            <h1>{toilet.name}</h1>
            <span>{toilet.code} · {toilet.floor || '—'} · {toilet.area || toilet.building || '—'}</span>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className={`detail-status ${status}`}>
          <span>{sm.icon}</span>
          <div>
            <small>CURRENT STATUS</small>
            <b>{sm.label}</b>
            <p>{toilet.last_cleaned_at ? `Last cleaned: ${new Date(toilet.last_cleaned_at).toLocaleString('en-IN')}` : 'Not yet cleaned'}</p>
          </div>
        </div>
        <div className="detail-kpis">
          <article>
            <small>Uptime</small>
            <strong>{toilet.uptime_pct != null ? `${toilet.uptime_pct}%` : '—'}</strong>
            <span>Cleanliness</span>
          </article>
          <article>
            <small>Units</small>
            <strong>{open} / {units.length || '—'}</strong>
            <span>Operational</span>
          </article>
          <article>
            <small>Complaints</small>
            <strong>{toilet.open_complaints || 0}</strong>
            <span>Open</span>
          </article>
        </div>
        {units.length > 0 && (
          <section className="drawer-section">
            <header>
              <div>
                <h2>Internal units</h2>
                <p>One unit issue does not close the block.</p>
              </div>
              <b>{open}/{units.length} open</b>
            </header>
            <div className="drawer-units">
              {units.map((u, i) => (
                <span className={u.operational === false ? 'broken' : ''} key={u.id || u.code || i}>
                  <b>U{String(i + 1).padStart(2, '0')}</b>
                  <i>{u.operational === false ? '⚒' : '✓'}</i>
                  <small>{u.issue || u.unit_type || u.type}</small>
                </span>
              ))}
            </div>
          </section>
        )}
        <footer>
          <button className="secondary" onClick={onAudit}>▣ Start audit</button>
          <button className="secondary" onClick={onScan}>▦ Open QR</button>
          <button className="primary" onClick={() => notify('Full toilet record opened')}>Full record →</button>
        </footer>
      </aside>
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
        <button className="mobile-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// Full login page matching reference design
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
          <strong>96.8<sup style={{fontSize:18}}>%</sup></strong>
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
            {error && <div style={{marginTop:12,padding:'8px 12px',background:'var(--red-soft)',color:'var(--red)',borderRadius:8,fontSize:9}}>{error}</div>}
            <div className="login-options">
              <label><input type="checkbox" /> Keep me signed in</label>
            </div>
            <button className="login-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to CleanPulse →'}</button>
          </form>
          <p className="security-note">Secured · Role-based access · Audit logged</p>
        </div>
      </div>
    </div>
  );
}

export default function CleanPulseApp() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview');
  const [toilets, setToilets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [scan, setScan] = useState(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [facilityName, setFacilityName] = useState('');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const navigate = useCallback((next) => {
    setView(next);
    setDetail(null);
    setSearch(false);
  }, []);

  async function loadData(prof) {
    if (!prof?.facility_id) return;
    try {
      const [ov, tl, fac] = await Promise.all([
        api(`/api/supervisor/toilets?facilityId=${prof.facility_id}`).catch(() => ({ data: [] })),
        api(`/api/admin/toilets?facilityId=${prof.facility_id}`).catch(() => ({ data: [] })),
        supabase.from('facilities').select('name').eq('id', prof.facility_id).single(),
      ]);
      const rows = (tl.data || ov.data || []);
      setToilets(rows);
      setFacilityName(fac.data?.name || prof.facilities?.name || 'BDBA Shatabdi Hospital');
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

  useEffect(() => {
    if (!profile?.facility_id) return;
    const ch = supabase.channel(`cp-admin-${profile.facility_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets', filter: `facility_id=eq.${profile.facility_id}` }, () => loadData(profile))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.facility_id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 15, background: 'var(--canvas)' }}>
        <div style={{ width: 42, height: 42, border: '3px solid var(--green)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <b style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--muted)' }}>OPENING CLEANPULSE</b>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!profile) {
    return <LoginPage onSuccess={bootstrap} />;
  }

  // Derive display initials and greeting
  const nameWords = (profile.full_name || 'Admin').split(' ');
  const userInitials = nameWords.map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const firstName = nameWords[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  // Find toilet for QR demo scan
  const scannedToilet = scan ? toilets.find(t => t.code === scan || t.id === scan) : null;

  const sharedProps = { toilets, setToilets, notify, onOpenToilet: setDetail };

  function renderContent() {
    switch (view) {
      case 'overview': return <Overview toilets={toilets} facilityId={profile.facility_id} onNavigate={navigate} onOpenToilet={setDetail} notify={notify} greeting={greeting} today={today} firstName={firstName} facilityName={facilityName} />;
      case 'live': return <LiveStatus {...sharedProps} onScan={() => toilets[0] && setScan(toilets[0].code)} />;
      case 'master': return <ToiletMaster {...sharedProps} facilityId={profile.facility_id} />;
      case 'units': return <InternalUnits {...sharedProps} facilityId={profile.facility_id} />;
      case 'facilities': case 'facility-setup': return <FacilitySetup notify={notify} />;
      case 'qr': return <QRStudio toilets={toilets} facilityId={profile.facility_id} notify={notify} onScan={(id) => setScan(id || (toilets[0] && toilets[0].code))} facilityName={facilityName} />;
      case 'complaints': return <Complaints {...sharedProps} facilityId={profile.facility_id} />;
      case 'maintenance': return <Maintenance {...sharedProps} facilityId={profile.facility_id} />;
      case 'cleaning': return <Cleaning facilityId={profile.facility_id} notify={notify} />;
      case 'audits': return <Audits toilets={toilets} facilityId={profile.facility_id} notify={notify} />;
      case 'cleaners': return <Cleaners facilityId={profile.facility_id} notify={notify} />;
      case 'users': return <Users facilityId={profile.facility_id} notify={notify} />;
      case 'analytics': return <Analytics facilityId={profile.facility_id} notify={notify} />;
      case 'reports': return <Reports facilityId={profile.facility_id} notify={notify} />;
      case 'settings': return <Settings facilityId={profile.facility_id} notify={notify} facilityName={facilityName} />;
      default: return null;
    }
  }

  return (
    <main className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand-mark">
          <span>CP</span>
          <div><b>CleanPulse</b><small>BMC HEALTH</small></div>
        </div>
        <nav aria-label="Main navigation">
          {GROUPS.map(g => (
            <div key={g.label}>
              <p>{g.label}</p>
              {g.items.map(item => (
                <button
                  key={item[0]}
                  className={view === item[0] ? 'nav-active' : ''}
                  onClick={() => navigate(item[0])}
                >
                  <span>{item[1]}</span>{item[2]}
                  {item[0] === 'complaints' && <em>3</em>}
                </button>
              ))}
            </div>
          ))}
          <p>SYSTEM</p>
          <button className={view === 'settings' ? 'nav-active' : ''} onClick={() => navigate('settings')}>
            <span>⚙</span>Settings
          </button>
        </nav>
        <div className="side-footer">
          <span className="avatar">{userInitials}</span>
          <button className="profile-button">
            <b>{profile.full_name}</b>
            <small>{profile.role === 'admin' ? 'Facility Admin' : 'Supervisor'} · {facilityName}</small>
          </button>
          <button aria-label="Account options" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>•••</button>
        </div>
      </aside>

      {/* Main workspace */}
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{(TITLE_MAP[view] || view).toUpperCase()}</p>
            <button>{facilityName} <span>⌄</span></button>
          </div>
          <div className="top-actions">
            <button className="demo-launch" onClick={() => toilets[0] && setScan(toilets[0].code)}>▦ QR demo</button>
            <span className="live"><i /> Live</span>
            <button aria-label="Search" onClick={() => setSearch(s => !s)}>⌕</button>
            <button aria-label="Notifications" onClick={() => setNotifications(n => !n)}>♧<em>3</em></button>
          </div>
          {search && (
            <div className="global-search">
              <span>⌕</span>
              <input autoFocus placeholder="Search toilet, ID, cleaner, complaint…" />
              <small>ESC to close</small>
            </div>
          )}
          {notifications && (
            <div className="notification-popover">
              <header><b>Notifications</b><button onClick={() => setNotifications(false)}>×</button></header>
              <article><span className="red">!</span><div><b>Wet floor · OPD Male</b><small>SLA expires in 6 minutes</small></div></article>
              <article><span className="ink">⚒</span><div><b>No water · Ward 3</b><small>Engineering acknowledged</small></div></article>
              <article><span className="green">✓</span><div><b>Cleaning complete</b><small>Casualty Male · photo verified</small></div></article>
            </div>
          )}
        </header>

        <div className="content">
          {renderContent()}
        </div>
      </section>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}><span>⌂</span>Overview</button>
        <button className={view === 'live' ? 'active' : ''} onClick={() => navigate('live')}><span>◎</span>Live</button>
        <button className="scan-button" onClick={() => toilets[0] && setScan(toilets[0].code)}><span>▦</span>Scan</button>
        <button className={view === 'complaints' ? 'active' : ''} onClick={() => navigate('complaints')}><span>!</span>Issues</button>
        <button className={view === 'master' ? 'active' : ''} onClick={() => navigate('master')}><span>▦</span>Assets</button>
      </nav>

      {/* Detail drawer */}
      {detail && (
        <ToiletDetail
          toilet={detail}
          onClose={() => setDetail(null)}
          onAudit={() => { setDetail(null); navigate('audits'); }}
          onScan={() => { setScan(detail.code); setDetail(null); }}
          notify={notify}
        />
      )}

      {/* QR demo experience */}
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

      {/* Toast */}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>{toast}
        </div>
      )}
    </main>
  );
}
