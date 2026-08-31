import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image, Table2, MapPin, Clock, CheckCircle, AlertTriangle, Loader,
  X, ChevronLeft, ChevronRight, ExternalLink, Search
} from 'lucide-react';

// ─── Evidence Lightbox ─────────────────────────────────────────────────────────
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
            <button className="lightbox-nav left" onClick={() => setCurrent(c => c - 1)}><ChevronLeft size={22} /></button>
          )}
          {current < items.length - 1 && (
            <button className="lightbox-nav right" onClick={() => setCurrent(c => c + 1)}><ChevronRight size={22} /></button>
          )}
          <div className="lightbox-counter">{current + 1} / {items.length}</div>
        </div>

        <div className="lightbox-meta">
          <div className="lm-row">
            <div className="lm-cell"><small>Toilet</small><b>{item.toilets?.name || '—'}</b><span>{item.toilets?.code || ''}</span></div>
            <div className="lm-cell"><small>Cleaner</small><b>{item.cleaners?.full_name || '—'}</b></div>
            <div className="lm-cell">
              <small>Completed</small>
              <b>{new Date(item.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b>
              <span>{new Date(item.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            </div>
            {duration && <div className="lm-cell"><small>Duration</small><b>{duration} min</b></div>}
          </div>
          {mapsUrl ? (
            <a className="lm-gps verified" href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin size={14} />
              <span>{Number(item.gps_lat).toFixed(5)}°N, {Number(item.gps_lng).toFixed(5)}°E</span>
              <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.7 }} />
            </a>
          ) : (
            <div className="lm-gps unverified"><AlertTriangle size={14} /><span>GPS not captured for this session</span></div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Cleaning({ facilityId, notify }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid'); // 'grid' | 'table'
  const [search, setSearch] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [withUrls, setWithUrls] = useState([]);
  const [loadingUrls, setLoadingUrls] = useState(false);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    supabase
      .from('cleaning_sessions')
      .select('id, started_at, completed_at, site_photo_path, gps_lat, gps_lng, toilets(name, code), cleaners(full_name)')
      .eq('facility_id', facilityId)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setSessions(data || []))
      .catch(() => {})
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

  // Filtered items for display
  const q = search.toLowerCase();
  const filtered = withUrls.filter(s =>
    !q ||
    s.toilets?.name?.toLowerCase().includes(q) ||
    s.toilets?.code?.toLowerCase().includes(q) ||
    s.cleaners?.full_name?.toLowerCase().includes(q)
  );
  const withPhotos = filtered.filter(s => s.signedUrl);

  // Stats
  const total = sessions.length;
  const withPhoto = sessions.filter(s => s.site_photo_path).length;
  const withGps = sessions.filter(s => s.gps_lat).length;
  const today = sessions.filter(s => {
    const d = new Date(s.completed_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>OPERATIONS / EVIDENCE</p>
          <h1>Cleaning Evidence Log</h1>
          <span>Immutable photo audit trail with GPS verification for every completed cycle.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('CSV exported')}>↓ Export</button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="compact-kpis">
        {[
          ['Total cycles', total, 'green'],
          ['Today', today, 'green'],
          ['With photo', withPhoto, 'green'],
          ['GPS verified', withGps, withGps === total ? 'green' : 'amber'],
          ['Missing photo', total - withPhoto, total - withPhoto > 0 ? 'red' : 'green'],
        ].map(([label, value, color]) => (
          <article className="panel" key={label}>
            <span className={`mini-dot ${color}`} />
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      {/* Controls */}
      <div className="table-tools">
        <div className="table-search">
          <Search size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search toilet, cleaner or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={view === 'grid' ? 'primary' : 'secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setView('grid')}
          >
            <Image size={14} /> Grid
          </button>
          <button
            className={view === 'table' ? 'primary' : 'secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setView('table')}
          >
            <Table2 size={14} /> Table
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="evidence-strip-loading" style={{ justifyContent: 'center', padding: '3rem', gap: '0.75rem' }}>
          <Loader size={20} style={{ animation: 'spin 0.8s linear infinite' }} color="var(--accent)" />
          <span>Loading cleaning logs…</span>
        </div>
      ) : view === 'grid' ? (
        <>
          {loadingUrls && withPhotos.length === 0 && (
            <div className="evidence-strip-loading" style={{ justifyContent: 'center', padding: '2rem' }}>
              <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              <span>Generating photo URLs…</span>
            </div>
          )}
          {withPhotos.length === 0 && !loadingUrls ? (
            <div className="evidence-empty" style={{ margin: '0 auto', maxWidth: 400 }}>
              <Image size={40} color="var(--text-tertiary)" />
              <p>No photo evidence found{search ? ' matching your search' : ' yet'}. Photos appear here after cleaners complete their first cycle with camera evidence.</p>
            </div>
          ) : (
            <div className="evidence-log-grid">
              {withPhotos.map((item, i) => {
                const duration = item.completed_at && item.started_at
                  ? Math.max(1, Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 60000))
                  : null;
                return (
                  <motion.button
                    key={item.id}
                    className="log-photo-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img src={item.signedUrl} className="log-photo-thumb" alt="Cleaning evidence" loading="lazy" />
                    <div className="log-photo-meta">
                      <b>{item.toilets?.name || '—'}</b>
                      <small>{item.cleaners?.full_name}</small>
                      <div className="ev-meta" style={{ marginTop: 4 }}>
                        <Clock size={10} />
                        <span>{relativeTime(item.completed_at)}{duration ? ` · ${duration}m` : ''}</span>
                      </div>
                      {item.gps_lat ? (
                        <div className="ev-gps-badge verified" style={{ position: 'static', marginTop: 6, width: 'fit-content' }}>
                          <MapPin size={9} /> GPS verified
                        </div>
                      ) : (
                        <div className="ev-gps-badge unverified" style={{ position: 'static', marginTop: 6, width: 'fit-content' }}>
                          <AlertTriangle size={9} /> No GPS
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* TABLE VIEW */
        <section className="master-table panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>Toilet</th><th>Cleaner</th><th>Duration</th><th>GPS</th><th>Evidence</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem' }}>
                    {search ? 'No results found' : 'No cleaning history yet'}
                  </td></tr>
                ) : filtered.map((s, i) => {
                  const duration = s.completed_at && s.started_at
                    ? Math.max(1, Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000))
                    : null;
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{new Date(s.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b>
                        <small>{relativeTime(s.completed_at)}</small>
                      </td>
                      <td><b>{s.toilets?.name || '—'}</b><small>{s.toilets?.code}</small></td>
                      <td><b>{s.cleaners?.full_name || '—'}</b><small>Staff cleaner</small></td>
                      <td><b>{duration ? `${duration}m` : '—'}</b></td>
                      <td>
                        {s.gps_lat
                          ? <a className="lm-gps verified" style={{ fontSize: '0.72rem', padding: '2px 8px', display: 'inline-flex', textDecoration: 'none' }} href={`https://www.google.com/maps?q=${s.gps_lat},${s.gps_lng}`} target="_blank" rel="noopener noreferrer">
                              <MapPin size={10} /> GPS
                            </a>
                          : <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>—</span>
                        }
                      </td>
                      <td>
                        {s.site_photo_path
                          ? <span style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Photo</span>
                          : <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>! Missing</span>
                        }
                      </td>
                      <td>
                        {s.signedUrl && (
                          <button className="row-menu" onClick={() => setLightboxIndex(i)} title="View photo">
                            <Image size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && withPhotos.length > 0 && (
          <EvidenceLightbox
            items={view === 'grid' ? withPhotos : filtered.filter(s => s.signedUrl)}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
