import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api, supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import CompletionMap from '../components/CompletionMap.jsx';
import { buildDemoToilets } from '../lib/demo-data.js';
import {
  CheckCircle, AlertTriangle, ShieldAlert, Wrench, Loader,
  MapPin, Clock, Users, ChevronRight, ChevronLeft,
  Camera, ZoomIn, X, ExternalLink, ArrowRight, Activity,
  Building2, Command, Sparkles
} from 'lucide-react';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_MAP = {
  CLEAN:          { label: 'Clean',          cls: 'st-green',  pillCls: 'pill-green',  Icon: CheckCircle  },
  CLEANING:       { label: 'Cleaning',       cls: 'st-blue',   pillCls: 'pill-blue',   Icon: Loader       },
  NEEDS_CLEANING: { label: 'Due',            cls: 'st-orange', pillCls: 'pill-orange', Icon: AlertTriangle },
  NOT_CLEANED:    { label: 'Not Cleaned',    cls: 'st-red',    pillCls: 'pill-red',    Icon: ShieldAlert  },
  OVERDUE:        { label: 'Overdue',        cls: 'st-red',    pillCls: 'pill-red',    Icon: ShieldAlert  },
  MAINTENANCE:    { label: 'Maintenance',    cls: 'st-gray',   pillCls: 'pill-gray',   Icon: Wrench       },
};

function getSt(t) {
  return STATUS_MAP[t.status] || STATUS_MAP[t.derived_status] || STATUS_MAP.NOT_CLEANED;
}

function AnimatedNumber({ value, minDigits = 0 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (localStorage.getItem('cp-motion') === 'off') {
      setDisplay(value);
      return undefined;
    }

    const startedAt = performance.now();
    const duration = 900;
    let frame;
    const tick = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return String(display).padStart(minDigits, '0');
}

const CELL_COLORS = {
  CLEAN:          '#22c55e',
  COMPLETED:      '#22c55e', // from session
  CLEANING:       '#3b82f6',
  IN_PROGRESS:    '#3b82f6', // from session
  NEEDS_CLEANING: '#f59e0b',
  NOT_CLEANED:    '#ef4444',
  OVERDUE:        '#ef4444',
  CANCELLED:      '#ef4444', // from session
  MISSED:         '#ef4444', // calculated
  PENDING:        '#e5e7eb', // calculated future
  MAINTENANCE:    '#94a3b8',
};

// ─── Evidence Lightbox ───────────────────────────────────────────────────────
function EvidenceLightbox({ items, index, onClose }) {
  const [cur, setCur] = useState(index);
  const item = items[cur];
  
  // Ensure we fetch signed URL if not present. For Dashboard, we might need to fetch it dynamically.
  const [signedUrl, setSignedUrl] = useState(item?.signedUrl || null);
  
  useEffect(() => {
    if (item && !item.signedUrl && item.site_photo_path) {
      supabase.storage.from('cleaning-evidence').createSignedUrl(item.site_photo_path, 3600)
        .then(({ data }) => setSignedUrl(data?.signedUrl))
        .catch(() => setSignedUrl(null));
    } else {
      setSignedUrl(item?.signedUrl);
    }
  }, [item]);

  useEffect(() => {
    const h = e => {
      if (e.key === 'ArrowRight') setCur(c => Math.min(c + 1, items.length - 1));
      if (e.key === 'ArrowLeft')  setCur(c => Math.max(c - 1, 0));
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [items.length, onClose]);

  if (!item) return null;

  const mapsUrl = item.gps_lat && item.gps_lng
    ? `https://www.google.com/maps?q=${item.gps_lat},${item.gps_lng}` : null;

  return (
    <motion.div className="lb2-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="lb2-container" initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}>
        <button className="lb2-close" onClick={onClose}><X size={16} /></button>
        {items.length > 1 && <div className="lb2-counter">{cur + 1} <span>/</span> {items.length}</div>}
        <div className="lb2-img-area">
          <AnimatePresence mode="wait">
            {signedUrl ? (
              <motion.img key={cur} src={signedUrl} alt="Evidence" className="lb2-img" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            ) : (
              <div className="lb2-img-ph"><Loader className="spin" size={24} /></div>
            )}
          </AnimatePresence>
          {items.length > 1 && cur > 0 && <button className="lb2-nav lb2-nav-left" onClick={() => setCur(c => c - 1)}><ChevronLeft size={20} /></button>}
          {items.length > 1 && cur < items.length - 1 && <button className="lb2-nav lb2-nav-right" onClick={() => setCur(c => c + 1)}><ChevronRight size={20} /></button>}
          {item.gps_lat
            ? <div className="lb2-stamp verified"><MapPin size={10} /> VERIFIED</div>
            : <div className="lb2-stamp unverified"><AlertTriangle size={10} /> UNVERIFIED</div>
          }
        </div>
        <div className="lb2-meta">
          <div className="lb2-meta-grid">
            <div className="lb2-meta-cell"><div className="lb2-meta-icon"><MapPin size={13} /></div><div><div className="lb2-meta-label">Location</div><div className="lb2-meta-value">{item.toilets?.name || '—'}</div></div></div>
            <div className="lb2-meta-cell"><div className="lb2-meta-icon"><Users size={13} /></div><div><div className="lb2-meta-label">Cleaner</div><div className="lb2-meta-value">{item.cleaners?.full_name || '—'}</div></div></div>
            <div className="lb2-meta-cell"><div className="lb2-meta-icon"><Clock size={13} /></div><div><div className="lb2-meta-label">Completed</div><div className="lb2-meta-value">{new Date(item.completed_at || item.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div><div className="lb2-meta-sub">{relativeTime(item.completed_at || item.started_at)}</div></div></div>
          </div>
          {mapsUrl
            ? <a className="lb2-gps-row verified" href={mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={13} /><span className="lb2-gps-coords">{Number(item.gps_lat).toFixed(5)}° N, {Number(item.gps_lng).toFixed(5)}° E</span><ExternalLink size={12} className="lb2-gps-ext" /></a>
            : <div className="lb2-gps-row unverified"><AlertTriangle size={13} /><span>GPS not captured</span></div>
          }
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Recent Evidence Strip ────────────────────────────────────────────────────
function RecentEvidence({ facilityId, onViewAll }) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    if (!facilityId) { setLoading(false); return; }
    api(`/api/admin/sessions?facility_id=${facilityId}&status=COMPLETED&limit=12`)
      .then(async (data) => {
        const sessions = (data.sessions || []).filter(s => s.site_photo_path);
        const withUrls = await Promise.all(sessions.map(async s => {
          try {
            const { data: u } = await supabase.storage.from('cleaning-evidence').createSignedUrl(s.site_photo_path, 3600);
            return { ...s, signedUrl: u?.signedUrl || null };
          } catch { return { ...s, signedUrl: null }; }
        }));
        setEvidence(withUrls.filter(e => e.signedUrl));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [facilityId]);

  if (loading) return (
    <div className="ev-strip">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="ev-card ev-skel" />)}
    </div>
  );

  if (!evidence.length) return (
    <div className="ev-empty">
      <Camera size={28} strokeWidth={1.5} />
      <span>No photo evidence yet. Photos appear after the first completed cleaning cycle.</span>
    </div>
  );

  return (
    <>
      <div className="ev-strip">
        {evidence.map((item, i) => (
          <motion.button
            key={item.id}
            className="ev-card"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03, y: -2 }}
            onClick={() => setLightboxIndex(i)}
          >
            <div className="ev-img-wrap">
              <img src={item.signedUrl} alt="Evidence" loading="lazy" className="ev-img" />
              <div className="ev-img-hover"><ZoomIn size={18} /></div>
              {item.gps_lat
                ? <div className="ev-gps-badge gps-v"><MapPin size={8} /> GPS</div>
                : <div className="ev-gps-badge gps-u"><AlertTriangle size={8} /></div>
              }
            </div>
            <div className="ev-info">
              <b>{item.toilets?.name || '—'}</b>
              <span>{relativeTime(item.completed_at)}</span>
            </div>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {lightboxIndex !== null && (
          <EvidenceLightbox items={evidence} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Status Grid (Multi-Session with Real Data) ──────────────────────────────────────────────
function StatusGrid({ toilets, facilityId, onToiletClick }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxSession, setLightboxSession] = useState(null);
  const [zoomLevel, setZoomLevel] = useState('SESSION'); // 'SESSION' | 'DAY' | 'WEEK'

  useEffect(() => {
    if (!facilityId) return;
    // Fetch sessions for the past ~10 days to fill the grid
    api(`/api/admin/sessions?facility_id=${facilityId}&limit=500`)
      .then(res => setSessions(res.sessions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [facilityId]);

  // Generate the last 10 days array (for the initial view)
  const days = useMemo(() => {
    const arr = [];
    for (let i = 9; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push({
        dateStr: d.toISOString().split('T')[0],
        dayNum: d.getDate(),
        month: d.toLocaleString('en-IN', { month: 'short' }),
        isToday: i === 0
      });
    }
    return arr;
  }, []);

  if (!toilets.length) return (
    <div className="grid-empty">
      <ShieldAlert size={40} strokeWidth={1.5} />
      <h3>No toilets set up yet</h3>
      <p>Add toilets in the Facilities tab to start live monitoring.</p>
    </div>
  );

  return (
    <div className="jg-outer">
      {/* Month header */}
      <div className="jg-month-bar">
        <div className="jg-month-name">
          Recent Activity {zoomLevel !== 'SESSION' && <span style={{fontSize:'0.8rem', opacity: 0.7}}>(Zoomed Out)</span>}
        </div>
        <div className="jg-view-btns">
          <button className={`jg-vbtn ${zoomLevel === 'SESSION' ? 'active' : ''}`} onClick={() => setZoomLevel('SESSION')}>Session View</button>
          <button className={`jg-vbtn ${zoomLevel === 'DAY' ? 'active' : ''}`} onClick={() => setZoomLevel('DAY')}>Day Summary</button>
          <button className={`jg-vbtn ${zoomLevel === 'WEEK' ? 'active' : ''}`} onClick={() => setZoomLevel('WEEK')}>Week Summary</button>
        </div>
      </div>

      <div className="jg-scroll-area">
        <table className="jg-table">
          <thead>
            <tr>
              <th className="jg-th jg-col-handle"></th>
              <th className="jg-th jg-col-name">Toilets</th>
              {days.map(d => (
                <th key={d.dateStr} className={`jg-th jg-col-day${d.isToday ? ' jg-today' : ''}`} style={{ borderLeft: '1px solid #e5e7eb' }}>
                  {d.dayNum} {d.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {toilets.map((t, ri) => {
              // Parse toilet schedule (default to a mock schedule if missing)
              const schedule = Array.isArray(t.cleaning_schedule) && t.cleaning_schedule.length > 0 
                ? t.cleaning_schedule 
                : ['08:00', '13:00', '17:00'];

              return (
                <motion.tr
                  key={t.id}
                  className="jg-row"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: ri * 0.03 }}
                >
                  <td className="jg-td jg-td-handle" onClick={() => onToiletClick && onToiletClick(t)}>
                    <span className="jg-handle">⠿</span>
                  </td>
                  <td className="jg-td jg-td-name" onClick={() => onToiletClick && onToiletClick(t)}>
                    <div className="jg-name-row">
                      <div className="jg-avatar-sm">{t.name[0].toUpperCase()}</div>
                      <span className="jg-toilet-name">{t.name}</span>
                    </div>
                  </td>
                  
                  {/* Day cells */}
                  {days.map((d, di) => {
                    const isToday = d.isToday;
                    
                    // Filter sessions for this toilet on this date
                    const daySessions = sessions.filter(s => {
                      if (s.toilet_id !== t.id) return false;
                      const sDate = new Date(s.started_at || s.completed_at).toISOString().split('T')[0];
                      return sDate === d.dateStr;
                    });

                    // Pre-compute statuses
                    let completedCount = 0;
                    const slots = schedule.map((timeStr, idx) => {
                      const s = daySessions[idx]; 
                      let st = 'PENDING';
                      if (s) {
                        st = s.status; 
                        if (st === 'COMPLETED') completedCount++;
                      } else if (new Date(`${d.dateStr}T${timeStr}`) < new Date()) {
                        st = 'MISSED'; 
                      }
                      return { s, st, timeStr };
                    });

                    // Aggregation logic for zoomed out views
                    const perc = schedule.length ? (completedCount / schedule.length) : 0;
                    let aggBg = CELL_COLORS.PENDING;
                    if (perc === 1) aggBg = CELL_COLORS.COMPLETED;
                    else if (perc > 0) aggBg = CELL_COLORS.NEEDS_CLEANING;
                    else if (new Date(d.dateStr) < new Date(new Date().toISOString().split('T')[0])) aggBg = CELL_COLORS.MISSED;

                    return (
                      <td key={d.dateStr} className={`jg-td jg-td-day${isToday ? ' jg-today-cell' : ''}`} style={{ borderLeft: '1px solid #f3f4f6' }}>
                        <div className="jg-multi-slots">
                          <AnimatePresence mode="popLayout">
                            {zoomLevel === 'SESSION' ? (
                              slots.map((slot, idx) => {
                                const bg = CELL_COLORS[slot.st] || '#e5e7eb';
                                const isClickable = slot.s && slot.s.status === 'COMPLETED';

                                return (
                                  <motion.div 
                                    key={`slot-${idx}`} 
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className={`jg-slot ${isClickable ? 'clickable' : ''}`} 
                                    style={{ backgroundColor: bg }}
                                    onClick={() => isClickable && setLightboxSession(slot.s)}
                                    title={`Scheduled: ${slot.timeStr} | Status: ${slot.st}`}
                                  >
                                    {slot.st === 'COMPLETED' && <span className="jg-cell-icon" style={{fontSize: '8px'}}>✓</span>}
                                    {slot.st === 'MISSED' && <span className="jg-cell-icon" style={{fontSize: '8px'}}>!</span>}
                                  </motion.div>
                                );
                              })
                            ) : (
                              <motion.div 
                                key="agg-day"
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="jg-slot clickable"
                                style={{ backgroundColor: aggBg, color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}
                                onClick={() => setZoomLevel('SESSION')}
                                title="Click to zoom in"
                              >
                                {completedCount}/{schedule.length}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="jg-legend">
        <div className="jg-legend-item"><span className="jg-leg-dot" style={{ background: CELL_COLORS.COMPLETED }} />Completed</div>
        <div className="jg-legend-item"><span className="jg-leg-dot" style={{ background: CELL_COLORS.MISSED }} />Missed</div>
        <div className="jg-legend-item"><span className="jg-leg-dot" style={{ background: CELL_COLORS.IN_PROGRESS }} />In Progress</div>
        <div className="jg-legend-item"><span className="jg-leg-dot" style={{ background: CELL_COLORS.PENDING }} />Pending</div>
      </div>

      {/* Evidence Modal */}
      <AnimatePresence>
        {lightboxSession && (
          <EvidenceLightbox 
            items={[lightboxSession]} 
            index={0} 
            onClose={() => setLightboxSession(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function KpiCards({ stats }) {
  const cleanShare = stats.total ? Math.round((stats.clean / stats.total) * 100) : 0;
  const cards = [
    { label: 'Clean & verified', value: stats.clean, note: `${cleanShare}% facility readiness`, tone: 'green', Icon: CheckCircle },
    { label: 'Attention queue', value: stats.due, note: 'Due soon or in progress', tone: 'amber', Icon: AlertTriangle },
    { label: 'Critical action', value: stats.alert, note: 'Immediate response required', tone: 'red', Icon: ShieldAlert },
    { label: 'Assets monitored', value: stats.total, note: 'Connected operational points', tone: 'indigo', Icon: Building2 },
  ];

  return (
    <div className="kpi-row">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          className={`kpi-card tone-${c.tone}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
        >
          <div className="kpi-card-top">
            <div className="kpi-icon"><c.Icon size={18} /></div>
            <span className="kpi-status-dot" />
          </div>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value"><AnimatedNumber value={c.value} minDigits={2} /></div>
          <div className="kpi-note">{c.note}</div>
          <div className="kpi-signal"><i /><i /><i /><i /></div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ toilets, greeting, firstName, today, onNavigate, facilityId, onToiletClick, facilityName }) {
  const [mapLightboxSession, setMapLightboxSession] = useState(null);
  const operationalToilets = useMemo(() => buildDemoToilets(56), []);
  const stats = useMemo(() => {
    let clean = 0, due = 0, alert = 0;
    for (const t of operationalToilets) {
      const c = getSt(t).cls;
      if (c === 'st-green') clean++;
      else if (c === 'st-orange' || c === 'st-blue') due++;
      else if (c === 'st-red') alert++;
    }
    return { clean, due, alert, total: operationalToilets.length };
  }, [operationalToilets]);

  return (
    <div className="dash-page">
      {/* Command hero */}
      <motion.section className="dash-hero" initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
        <div className="dash-hero-glow dash-hero-glow-a" />
        <div className="dash-hero-glow dash-hero-glow-b" />
        <div className="dash-hero-orbit" aria-hidden="true"><i /><i /><i /></div>
        <div className="dash-hero-content">
          <div className="dash-hero-eyebrow"><Command size={13} /> Live facility command centre</div>
          <h1>{greeting}, <span>{firstName}</span></h1>
          <p>Every sanitation point, cleaning cycle, and citizen signal—visible in one operational picture.</p>
          <div className="dash-hero-meta">
            <span><Building2 size={13} /> {facilityName}</span>
            <span><Clock size={13} /> {today}</span>
          </div>
        </div>
        <div className="dash-hero-readiness">
          <div className="dash-live-badge"><span className="dash-live-dot" /> Live sync</div>
          <div className="dash-readiness-value"><AnimatedNumber value={stats.total ? Math.round((stats.clean / stats.total) * 100) : 0} /><sup>%</sup></div>
          <div className="dash-readiness-label">Facility readiness</div>
          <div className="dash-readiness-track"><i style={{ width: `${stats.total ? Math.round((stats.clean / stats.total) * 100) : 0}%` }} /></div>
        </div>
      </motion.section>

      {/* KPI Row */}
      <KpiCards stats={stats} />

      {/* Attendance Grid */}
      <motion.div
        className="dash-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="dash-card-hd">
          <div>
            <div className="dash-card-kicker"><Sparkles size={11} /> Operational intelligence</div>
            <div className="dash-card-title">
              <Activity size={15} />
              Cleaning Completion Map
            </div>
            <div className="dash-card-sub">Zoom from individual cleaning sessions to day, week, and month-level performance.</div>
          </div>
          <button className="dash-see-all" onClick={() => onNavigate('facilities')}>
            Manage Schedules <ArrowRight size={13} />
          </button>
        </div>
        <CompletionMap
          toilets={operationalToilets}
          facilityId={facilityId}
          onToiletClick={onToiletClick}
          onSessionClick={setMapLightboxSession}
          demoMode
        />
      </motion.div>

      {/* Recent Evidence */}
      <motion.div
        className="dash-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="dash-card-hd">
          <div>
            <div className="dash-card-kicker"><Camera size={11} /> Verified activity</div>
            <div className="dash-card-title">
              <Camera size={15} />
              Recent Cleaning Evidence
            </div>
            <div className="dash-card-sub">GPS-stamped photo proof · click to inspect</div>
          </div>
          <button className="dash-see-all" onClick={() => onNavigate('cleaning')}>
            View All <ArrowRight size={13} />
          </button>
        </div>
        <RecentEvidence facilityId={facilityId} onViewAll={() => onNavigate('cleaning')} />
      </motion.div>

      <AnimatePresence>
        {mapLightboxSession && (
          <EvidenceLightbox items={[mapLightboxSession]} index={0} onClose={() => setMapLightboxSession(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
