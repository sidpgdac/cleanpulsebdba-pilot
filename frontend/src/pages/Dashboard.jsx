import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader, AlertTriangle, ShieldAlert, Wrench, Image, X, MapPin, Clock, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS = {
  CLEAN:         { label: 'Clean',          color: 'green',   icon: Sparkles },
  CLEANING:      { label: 'Cleaning Now',   color: 'orange',  icon: Loader },
  NEEDS_CLEANING:{ label: 'Needs Cleaning', color: 'orange',  icon: AlertTriangle },
  NOT_CLEANED:   { label: 'Not Cleaned',    color: 'red',     icon: ShieldAlert },
  OVERDUE:       { label: 'Overdue',        color: 'red',     icon: ShieldAlert },
  MAINTENANCE:   { label: 'Maintenance',    color: 'dark',    icon: Wrench },
};
function getStatus(t) { return STATUS[t.status] || STATUS[t.derived_status] || STATUS.NOT_CLEANED; }

// ─── Evidence Lightbox ────────────────────────────────────────────────────────
function EvidenceLightbox({ items, index, onClose }) {
  const [current, setCurrent] = useState(index);
  const item = items[current];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setCurrent(c => Math.min(c + 1, items.length - 1));
      if (e.key === 'ArrowLeft')  setCurrent(c => Math.max(c - 1, 0));
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, onClose]);

  const duration = item.completed_at && item.started_at
    ? Math.max(1, Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 60000))
    : null;
  const mapsUrl = item.gps_lat && item.gps_lng
    ? `https://www.google.com/maps?q=${item.gps_lat},${item.gps_lng}`
    : null;

  return (
    <motion.div className="lightbox-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="lightbox-container"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="lightbox-close" onClick={onClose}><X size={18} /></button>

        <div className="lightbox-image-wrap">
          <AnimatePresence mode="wait">
            <motion.img key={current} src={item.signedUrl} alt="Evidence" className="lightbox-img"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
            />
          </AnimatePresence>

          {current > 0 && (
            <button className="lightbox-nav left" onClick={() => setCurrent(c => c - 1)}>
              <ChevronLeft size={22} />
            </button>
          )}
          {current < items.length - 1 && (
            <button className="lightbox-nav right" onClick={() => setCurrent(c => c + 1)}>
              <ChevronRight size={22} />
            </button>
          )}
          <div className="lightbox-counter">{current + 1} / {items.length}</div>
        </div>

        <div className="lightbox-meta">
          <div className="lm-row">
            <div className="lm-cell">
              <small>Toilet</small>
              <b>{item.toilets?.name || '—'}</b>
              <span>{item.toilets?.code || ''}</span>
            </div>
            <div className="lm-cell">
              <small>Cleaner</small>
              <b>{item.cleaners?.full_name || '—'}</b>
            </div>
            <div className="lm-cell">
              <small>Completed</small>
              <b>{new Date(item.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b>
              <span>{relativeTime(item.completed_at)}</span>
            </div>
            {duration && (
              <div className="lm-cell">
                <small>Duration</small>
                <b>{duration} min</b>
              </div>
            )}
          </div>

          {mapsUrl ? (
            <a className="lm-gps verified" href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin size={14} />
              <span>{Number(item.gps_lat).toFixed(5)}°N, {Number(item.gps_lng).toFixed(5)}°E</span>
              <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.7 }} />
            </a>
          ) : (
            <div className="lm-gps unverified">
              <AlertTriangle size={14} />
              <span>GPS not captured for this session</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Evidence Strip ────────────────────────────────────────────────────────────
function RecentEvidence({ facilityId }) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    if (!facilityId) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('cleaning_sessions')
          .select('id, started_at, completed_at, site_photo_path, gps_lat, gps_lng, toilets(name, code), cleaners(full_name)')
          .eq('facility_id', facilityId)
          .eq('status', 'COMPLETED')
          .not('site_photo_path', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(10);
        if (error) throw error;

        const withUrls = await Promise.all((data || []).map(async (session) => {
          try {
            const { data: urlData } = await supabase.storage
              .from('cleaning-evidence')
              .createSignedUrl(session.site_photo_path, 3600);
            return { ...session, signedUrl: urlData?.signedUrl || null };
          } catch { return { ...session, signedUrl: null }; }
        }));
        setEvidence(withUrls.filter(e => e.signedUrl));
      } catch (err) {
        console.error('Evidence load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [facilityId]);

  if (loading) return (
    <div className="evidence-strip-loading">
      <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
      <span>Loading evidence…</span>
    </div>
  );

  if (evidence.length === 0) return (
    <div className="evidence-empty">
      <Image size={32} color="var(--text-tertiary)" />
      <p>No cleaning evidence yet. Photos will appear here after the first completed cleaning cycle.</p>
    </div>
  );

  return (
    <>
      <div className="evidence-strip">
        {evidence.map((item, i) => {
          const duration = item.completed_at && item.started_at
            ? Math.max(1, Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 60000))
            : null;
          return (
            <motion.button
              key={item.id}
              className="evidence-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 26 }}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLightboxIndex(i)}
            >
              <div className="evidence-thumb">
                <img src={item.signedUrl} alt="Evidence" loading="lazy" />
                {item.gps_lat ? (
                  <div className="ev-gps-badge verified"><MapPin size={9} /> GPS</div>
                ) : (
                  <div className="ev-gps-badge unverified"><AlertTriangle size={9} /> No GPS</div>
                )}
              </div>
              <div className="evidence-info">
                <b>{item.toilets?.name || '—'}</b>
                <small>{item.cleaners?.full_name}</small>
                <div className="ev-meta">
                  <Clock size={10} />
                  <span>{relativeTime(item.completed_at)}{duration ? ` · ${duration}m` : ''}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {lightboxIndex !== null && (
          <EvidenceLightbox items={evidence} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Toilet Card ──────────────────────────────────────────────────────────────
function ToiletCard({ toilet, onOpen }) {
  const st = getStatus(toilet);
  const Icon = st.icon;
  return (
    <motion.button
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      className={`toilet-card ${st.color}`}
      onClick={() => onOpen(toilet)}
      aria-label={`${toilet.name} — ${st.label}`}
    >
      <div className="tc-header">
        <div className="tc-title">
          <b>{toilet.name}</b>
          <small>{[toilet.floor, toilet.area].filter(Boolean).join(' · ') || toilet.building || '—'}</small>
        </div>
        <div className={`tc-status-pill ${st.color}`}><Icon size={14} /> {st.label}</div>
      </div>
      <div className="tc-footer">
        <span className="code-tag">{toilet.code}</span>
        <span className="time-tag">{toilet.last_cleaned_at ? relativeTime(toilet.last_cleaned_at) : 'Not yet'}</span>
      </div>
    </motion.button>
  );
}

// ─── Add Facility Modal ───────────────────────────────────────────────────────
function AddFacilityModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const code = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 5) + Math.floor(Math.random() * 1000);
      const { data, error } = await supabase.from('facilities').insert({ name: name.trim(), code }).select().single();
      if (error) throw error;
      onSuccess(data);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="glass-modal"
        onClick={e => e.stopPropagation()}
      >
        <h2>Add New Facility</h2>
        <p>Create a new facility (e.g. Hospital, Station, Mall).</p>
        <form onSubmit={submit}>
          <input autoFocus type="text" placeholder="Facility Name..." value={name} onChange={e => setName(e.target.value)} disabled={busy} />
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? 'Creating...' : 'Create Facility'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard({ toilets, greeting, firstName, today, onNavigate, facilityId }) {
  const [showAddFacility, setShowAddFacility] = useState(false);

  const stats = useMemo(() => {
    let clean = 0, due = 0, alert = 0;
    for (const t of toilets) {
      const st = getStatus(t);
      if (st.color === 'green') clean++;
      else if (st.color === 'orange') due++;
      else if (st.color === 'red') alert++;
    }
    return { clean, due, alert, total: toilets.length };
  }, [toilets]);

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

  return (
    <div className="dashboard-layout">

      {/* ── Header ── */}
      <header className="dash-header">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p>{today} · {stats.total} toilets being monitored.</p>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="primary" onClick={() => setShowAddFacility(true)}>
          + Add Facility
        </motion.button>
      </header>

      {/* ── KPI Cards ── */}
      <motion.div className="kpi-grid" variants={containerVariants} initial="hidden" animate="show">
        <motion.div className="kpi-card green" variants={itemVariants}>
          <div className="kpi-icon"><Sparkles size={24} color="var(--green)" /></div>
          <div className="kpi-data"><h2>{stats.clean}</h2><span>Clean &amp; Ready</span></div>
        </motion.div>
        <motion.div className="kpi-card orange" variants={itemVariants}>
          <div className="kpi-icon"><Loader size={24} color="var(--orange)" /></div>
          <div className="kpi-data"><h2>{stats.due}</h2><span>Cleaning Now / Due</span></div>
        </motion.div>
        <motion.div className="kpi-card red" variants={itemVariants}>
          <div className="kpi-icon"><ShieldAlert size={24} color="var(--red)" /></div>
          <div className="kpi-data"><h2>{stats.alert}</h2><span>Overdue / Dirty</span></div>
        </motion.div>
        <motion.div className="kpi-card blue analytics-mini" variants={itemVariants}>
          <div className="analytics-header"><span>7-Day Compliance</span><strong>92%</strong></div>
          <div className="css-bar-chart">
            {[60, 80, 40, 90, 100, 85, 92].map((h, i) => (
              <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ duration: 1, delay: i * 0.1 }} className="bar" />
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ── Recent Cleaning Evidence ── */}
      <motion.div className="dash-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}>
        <div className="section-header">
          <div>
            <h2>Recent Cleaning Evidence</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
              GPS-stamped photo proof · click any card to inspect
            </p>
          </div>
          <button className="ghost-link" onClick={() => onNavigate('cleaning')}>View All Logs →</button>
        </div>
        <RecentEvidence facilityId={facilityId} />
      </motion.div>

      {/* ── Live Toilet Wall ── */}
      <motion.div className="dash-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4 }}>
        <div className="section-header">
          <h2>Live Facility Status</h2>
          <button className="ghost-link" onClick={() => onNavigate('facilities')}>Manage Toilets →</button>
        </div>
        <motion.div className="toilet-grid" variants={containerVariants} initial="hidden" animate="show">
          {toilets.length === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
              <h3>No Toilets Found</h3>
              <p>Add your first toilet in the Facilities tab.</p>
              <button className="secondary" onClick={() => onNavigate('facilities')}>Go to Facilities</button>
            </div>
          ) : (
            toilets.map((t) => (
              <motion.div key={t.id} variants={itemVariants}>
                <ToiletCard toilet={t} onOpen={() => onNavigate('facilities')} />
              </motion.div>
            ))
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showAddFacility && (
          <AddFacilityModal onClose={() => setShowAddFacility(false)} onSuccess={(f) => alert(`Created: ${f.name}`)} />
        )}
      </AnimatePresence>
    </div>
  );
}
