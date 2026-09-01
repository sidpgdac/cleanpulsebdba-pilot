import React, { useEffect, useState, useCallback } from 'react';
import { supabase, api } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Table2, MapPin, Clock, CheckCircle, AlertTriangle, Loader,
  X, ChevronLeft, ChevronRight, ExternalLink, Search, Shield,
  Image as ImageIcon, Download, ZoomIn, User, Calendar, Timer,
  LayoutGrid, List, TrendingUp
} from 'lucide-react';

// ─── Skeleton Card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="ev2-card ev2-skeleton">
      <div className="ev2-card-img-wrap ev2-skel-img" />
      <div className="ev2-card-body">
        <div className="ev2-skel-line wide" />
        <div className="ev2-skel-line medium" />
        <div className="ev2-skel-line short" />
      </div>
    </div>
  );
}

// ─── Evidence Lightbox ──────────────────────────────────────────────────────────
function EvidenceLightbox({ items, index, onClose }) {
  const [current, setCurrent] = useState(index);
  const item = items[current];

  const go = useCallback((dir) => {
    setCurrent(c => Math.min(Math.max(c + dir, 0), items.length - 1));
  }, [items.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft')  go(-1);
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const duration = item.completed_at && item.started_at
    ? Math.max(1, Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 60000))
    : null;
  const mapsUrl = item.gps_lat && item.gps_lng
    ? `https://www.google.com/maps?q=${item.gps_lat},${item.gps_lng}`
    : null;

  const completedDate = new Date(item.completed_at);

  return (
    <motion.div
      className="lb2-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="lb2-container"
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button className="lb2-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        {/* Counter pill */}
        <div className="lb2-counter">
          {current + 1} <span>/</span> {items.length}
        </div>

        {/* Image area */}
        <div className="lb2-img-area">
          <AnimatePresence mode="wait">
            <motion.img
              key={current}
              src={item.signedUrl}
              alt="Cleaning evidence"
              className="lb2-img"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22 }}
            />
          </AnimatePresence>

          {/* Nav arrows */}
          {current > 0 && (
            <motion.button
              className="lb2-nav lb2-nav-left"
              onClick={() => go(-1)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
            >
              <ChevronLeft size={20} />
            </motion.button>
          )}
          {current < items.length - 1 && (
            <motion.button
              className="lb2-nav lb2-nav-right"
              onClick={() => go(1)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
            >
              <ChevronRight size={20} />
            </motion.button>
          )}

          {/* Verification stamp */}
          {item.gps_lat ? (
            <div className="lb2-stamp verified">
              <Shield size={11} strokeWidth={2.5} /> VERIFIED
            </div>
          ) : (
            <div className="lb2-stamp unverified">
              <AlertTriangle size={11} strokeWidth={2.5} /> UNVERIFIED
            </div>
          )}
        </div>

        {/* Meta panel */}
        <div className="lb2-meta">
          <div className="lb2-meta-grid">
            {/* Location */}
            <div className="lb2-meta-cell">
              <div className="lb2-meta-icon"><MapPin size={13} /></div>
              <div>
                <div className="lb2-meta-label">Location</div>
                <div className="lb2-meta-value">{item.toilets?.name || '—'}</div>
                <div className="lb2-meta-sub">{item.toilets?.code || ''}</div>
              </div>
            </div>

            {/* Cleaner */}
            <div className="lb2-meta-cell">
              <div className="lb2-meta-icon"><User size={13} /></div>
              <div>
                <div className="lb2-meta-label">Cleaner</div>
                <div className="lb2-meta-value">{item.cleaners?.full_name || '—'}</div>
                <div className="lb2-meta-sub">Field Staff</div>
              </div>
            </div>

            {/* Date & time */}
            <div className="lb2-meta-cell">
              <div className="lb2-meta-icon"><Calendar size={13} /></div>
              <div>
                <div className="lb2-meta-label">Completed</div>
                <div className="lb2-meta-value">
                  {completedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="lb2-meta-sub">
                  {completedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Duration */}
            {duration && (
              <div className="lb2-meta-cell">
                <div className="lb2-meta-icon"><Timer size={13} /></div>
                <div>
                  <div className="lb2-meta-label">Duration</div>
                  <div className="lb2-meta-value">{duration} min</div>
                  <div className="lb2-meta-sub">Cleaning cycle</div>
                </div>
              </div>
            )}
          </div>

          {/* GPS row */}
          {mapsUrl ? (
            <a className="lb2-gps-row verified" href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin size={13} />
              <span className="lb2-gps-coords">
                {Number(item.gps_lat).toFixed(5)}° N, {Number(item.gps_lng).toFixed(5)}° E
              </span>
              <span className="lb2-gps-acc">±{Math.round(item.gps_accuracy || 0)}m accuracy</span>
              <ExternalLink size={12} className="lb2-gps-ext" />
            </a>
          ) : (
            <div className="lb2-gps-row unverified">
              <AlertTriangle size={13} />
              <span>GPS coordinates not captured for this session</span>
            </div>
          )}

          {/* Dot strip nav */}
          {items.length > 1 && (
            <div className="lb2-dots">
              {items.map((_, i) => (
                <button
                  key={i}
                  className={`lb2-dot ${i === current ? 'active' : ''}`}
                  onClick={() => setCurrent(i)}
                  aria-label={`Go to photo ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function Cleaning({ facilityId, notify }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [withUrls, setWithUrls] = useState([]);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [filterGps, setFilterGps] = useState(false);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    api(`/api/admin/sessions?facility_id=${facilityId}&status=COMPLETED&limit=100`)
      .then((data) => setSessions(data.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [facilityId]);

  // Generate signed URLs for all sessions with photos
  useEffect(() => {
    if (!sessions.length) { setWithUrls([]); return; }
    setLoadingUrls(true);
    Promise.all(
      sessions.map(async (s) => {
        if (!s.site_photo_path) return { ...s, signedUrl: null };
        try {
          const { data } = await supabase.storage
            .from('cleaning-evidence')
            .createSignedUrl(s.site_photo_path, 3600);
          return { ...s, signedUrl: data?.signedUrl || null };
        } catch { return { ...s, signedUrl: null }; }
      })
    ).then(results => setWithUrls(results)).finally(() => setLoadingUrls(false));
  }, [sessions]);

  const q = search.toLowerCase();
  const filtered = withUrls.filter(s =>
    (!q || s.toilets?.name?.toLowerCase().includes(q) || s.toilets?.code?.toLowerCase().includes(q) || s.cleaners?.full_name?.toLowerCase().includes(q)) &&
    (!filterGps || s.gps_lat)
  );
  const withPhotos = filtered.filter(s => s.signedUrl);

  // Stats
  const total = sessions.length;
  const withPhoto = sessions.filter(s => s.site_photo_path).length;
  const withGps = sessions.filter(s => s.gps_lat).length;
  const today = sessions.filter(s => new Date(s.completed_at).toDateString() === new Date().toDateString()).length;
  const coverageRate = total > 0 ? Math.round((withPhoto / total) * 100) : 0;

  const kpis = [
    { label: 'Total Cycles', value: total, sub: 'All time', icon: TrendingUp, color: 'accent' },
    { label: 'Today', value: today, sub: 'sessions', icon: Calendar, color: 'green' },
    { label: 'With Photo', value: withPhoto, sub: `${coverageRate}% coverage`, icon: Camera, color: 'green' },
    { label: 'GPS Verified', value: withGps, sub: `${total > 0 ? Math.round((withGps/total)*100) : 0}% verified`, icon: Shield, color: withGps === total ? 'green' : 'amber' },
    { label: 'Missing Photo', value: total - withPhoto, sub: 'No evidence', icon: AlertTriangle, color: total - withPhoto > 0 ? 'red' : 'green' },
  ];

  const lightboxItems = view === 'grid' ? withPhotos : filtered.filter(s => s.signedUrl);

  return (
    <section className="page-stack">
      {/* ── Header ── */}
      <div className="ev2-header">
        <div className="ev2-header-text">
          <div className="ev2-breadcrumb">OPERATIONS · EVIDENCE</div>
          <h1 className="ev2-title">Cleaning Evidence Log</h1>
          <p className="ev2-subtitle">
            Immutable photo audit trail with GPS verification for every completed cleaning cycle.
          </p>
        </div>
        <div className="ev2-header-actions">
          <motion.button
            className="ev2-export-btn"
            onClick={() => notify('CSV export coming soon')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <Download size={14} />
            Export CSV
          </motion.button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="ev2-kpis">
        {kpis.map(({ label, value, sub, icon: Icon, color }, i) => (
          <motion.div
            key={label}
            className={`ev2-kpi-card ev2-kpi-${color}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="ev2-kpi-icon"><Icon size={15} strokeWidth={2} /></div>
            <div className="ev2-kpi-body">
              <div className="ev2-kpi-value">{value}</div>
              <div className="ev2-kpi-label">{label}</div>
              <div className="ev2-kpi-sub">{sub}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="ev2-toolbar">
        <div className="ev2-search">
          <Search size={14} className="ev2-search-icon" />
          <input
            placeholder="Search by toilet, cleaner or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ev2-search-input"
          />
          {search && (
            <button className="ev2-search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        <div className="ev2-toolbar-right">
          <motion.button
            className={`ev2-filter-pill ${filterGps ? 'active' : ''}`}
            onClick={() => setFilterGps(v => !v)}
            whileTap={{ scale: 0.95 }}
          >
            <Shield size={12} />
            GPS only
          </motion.button>

          <div className="ev2-view-toggle">
            <button
              className={`ev2-view-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`ev2-view-btn ${view === 'table' ? 'active' : ''}`}
              onClick={() => setView('table')}
              title="Table view"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Results count ── */}
      {!loading && (
        <div className="ev2-results-count">
          {filtered.length > 0
            ? <><span className="ev2-results-num">{withPhotos.length}</span> photos found{search ? ` for "${search}"` : ''}</>
            : search ? `No results for "${search}"` : 'No records found'
          }
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="ev2-loading-grid">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : view === 'grid' ? (
        <>
          {loadingUrls && withPhotos.length === 0 && (
            <div className="ev2-loading-bar">
              <div className="ev2-loading-bar-inner" />
              <span>Loading photo previews…</span>
            </div>
          )}

          {withPhotos.length === 0 && !loadingUrls ? (
            <motion.div
              className="ev2-empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="ev2-empty-icon">
                <Camera size={32} strokeWidth={1.5} />
              </div>
              <h3>No evidence photos{search ? ' found' : ' yet'}</h3>
              <p>
                {search
                  ? `No sessions match "${search}". Try a different search term.`
                  : 'Photos will appear here after cleaners complete their first cycle using the QR scan flow.'
                }
              </p>
            </motion.div>
          ) : (
            <div className="ev2-grid">
              <AnimatePresence>
                {withPhotos.map((item, i) => {
                  const duration = item.completed_at && item.started_at
                    ? Math.max(1, Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 60000))
                    : null;
                  return (
                    <motion.button
                      key={item.id}
                      className="ev2-card"
                      initial={{ opacity: 0, scale: 0.94, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ delay: Math.min(i * 0.05, 0.4), type: 'spring', stiffness: 300, damping: 26 }}
                      whileHover={{ y: -4, transition: { duration: 0.18 } }}
                      onClick={() => setLightboxIndex(i)}
                    >
                      {/* Image */}
                      <div className="ev2-card-img-wrap">
                        <img
                          src={item.signedUrl}
                          className="ev2-card-img"
                          alt="Cleaning evidence"
                          loading="lazy"
                        />
                        <div className="ev2-card-overlay">
                          <div className="ev2-card-zoom"><ZoomIn size={20} /></div>
                        </div>
                        {item.gps_lat ? (
                          <div className="ev2-badge ev2-badge-verified">
                            <Shield size={8} strokeWidth={3} /> GPS
                          </div>
                        ) : (
                          <div className="ev2-badge ev2-badge-warn">
                            <AlertTriangle size={8} strokeWidth={2.5} /> No GPS
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="ev2-card-body">
                        <div className="ev2-card-name">{item.toilets?.name || '—'}</div>
                        <div className="ev2-card-cleaner">
                          <User size={10} />
                          {item.cleaners?.full_name || '—'}
                        </div>
                        <div className="ev2-card-footer">
                          <div className="ev2-card-time">
                            <Clock size={10} />
                            {relativeTime(item.completed_at)}
                            {duration ? ` · ${duration}m` : ''}
                          </div>
                          {item.toilets?.code && (
                            <div className="ev2-card-code">{item.toilets.code}</div>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      ) : (
        /* ── Table View ── */
        <motion.div
          className="ev2-table-wrap panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="table-scroll">
            <table className="ev2-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Toilet</th>
                  <th>Cleaner</th>
                  <th>Date & Time</th>
                  <th>Duration</th>
                  <th>GPS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ev2-table-empty">
                      {search ? `No results for "${search}"` : 'No cleaning history yet'}
                    </td>
                  </tr>
                ) : filtered.map((s, i) => {
                  const duration = s.completed_at && s.started_at
                    ? Math.max(1, Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000))
                    : null;
                  return (
                    <tr
                      key={s.id}
                      className="ev2-table-row"
                      onClick={s.signedUrl ? () => setLightboxIndex(filtered.filter(f => f.signedUrl).indexOf(s)) : undefined}
                      style={{ cursor: s.signedUrl ? 'pointer' : 'default' }}
                    >
                      <td>
                        {s.signedUrl
                          ? <div className="ev2-table-thumb-wrap">
                              <img src={s.signedUrl} className="ev2-table-thumb" alt="" />
                              <div className="ev2-table-thumb-overlay"><ZoomIn size={12}/></div>
                            </div>
                          : <div className="ev2-table-no-photo"><ImageIcon size={14} /></div>
                        }
                      </td>
                      <td>
                        <div className="ev2-cell-primary">{s.toilets?.name || '—'}</div>
                        <div className="ev2-cell-secondary">{s.toilets?.code}</div>
                      </td>
                      <td>
                        <div className="ev2-cell-primary">{s.cleaners?.full_name || '—'}</div>
                        <div className="ev2-cell-secondary">Field Staff</div>
                      </td>
                      <td>
                        <div className="ev2-cell-primary">
                          {new Date(s.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="ev2-cell-secondary">
                          {new Date(s.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </div>
                      </td>
                      <td>
                        <div className="ev2-cell-primary">{duration ? `${duration}m` : '—'}</div>
                      </td>
                      <td>
                        {s.gps_lat
                          ? <a
                              className="ev2-table-gps verified"
                              href={`https://www.google.com/maps?q=${s.gps_lat},${s.gps_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              <MapPin size={10} /> GPS
                            </a>
                          : <span className="ev2-table-gps-missing">—</span>
                        }
                      </td>
                      <td>
                        {s.site_photo_path
                          ? <span className="ev2-status-pill ev2-status-ok"><CheckCircle size={10} /> Photo</span>
                          : <span className="ev2-status-pill ev2-status-miss"><AlertTriangle size={10} /> Missing</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && lightboxItems.length > 0 && (
          <EvidenceLightbox
            items={lightboxItems}
            index={Math.min(lightboxIndex, lightboxItems.length - 1)}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
