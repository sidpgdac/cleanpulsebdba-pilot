import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS = {
  CLEAN:         { label: 'Clean',          color: 'clean',  dot: '#7ce0b4', icon: '✓' },
  CLEANING:      { label: 'Cleaning Now',   color: 'due',    dot: '#f59e0b', icon: '◷' },
  NEEDS_CLEANING:{ label: 'Needs Cleaning', color: 'alert',  dot: '#ef4444', icon: '!' },
  NOT_CLEANED:   { label: 'Not Cleaned',    color: 'alert',  dot: '#ef4444', icon: '!' },
  OVERDUE:       { label: 'Overdue',        color: 'alert',  dot: '#dc2626', icon: '‼' },
  MAINTENANCE:   { label: 'Maintenance',    color: 'dark',   dot: '#6b7280', icon: '⚒' },
};

function getStatus(t) {
  return STATUS[t.status] || STATUS[t.derived_status] || STATUS.NOT_CLEANED;
}

// ─── Toilet Card ─────────────────────────────────────────────────────────────
function ToiletCard({ toilet, onOpen, onScan }) {
  const st = getStatus(toilet);
  return (
    <button
      className={`toilet-card-simple ${st.color}`}
      onClick={() => onOpen(toilet)}
      aria-label={`${toilet.name} — ${st.label}`}
    >
      {/* Status stripe on left */}
      <span className="tc-stripe" style={{ background: st.dot }} />

      <div className="tc-body">
        <div className="tc-top">
          <div>
            <b className="tc-name">{toilet.name}</b>
            <small className="tc-loc">{[toilet.floor, toilet.area].filter(Boolean).join(' · ') || toilet.building || '—'}</small>
          </div>
          <span className={`tc-badge ${st.color}`}>{st.icon} {st.label}</span>
        </div>
        <div className="tc-bottom">
          <small>{toilet.code}</small>
          <small>{toilet.num_units > 0 ? `${toilet.num_units} units` : ''}</small>
          <small>{toilet.last_cleaned_at ? `Cleaned ${relativeTime(toilet.last_cleaned_at)}` : 'Not yet cleaned'}</small>
        </div>
      </div>
    </button>
  );
}

// ─── Toilet Detail Drawer ────────────────────────────────────────────────────
function ToiletDrawer({ toilet, onClose, onScan }) {
  const st = getStatus(toilet);
  const interval = toilet.cleaning_interval_minutes;
  return (
    <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="detail-drawer">
        <header>
          <div>
            <p>TOILET DETAIL</p>
            <h1>{toilet.name}</h1>
            <span>{toilet.code} · {[toilet.floor, toilet.area].filter(Boolean).join(' · ') || '—'}</span>
          </div>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>

        {/* Status */}
        <div className={`detail-status ${st.color}`}>
          <span>{st.icon}</span>
          <div>
            <small>CURRENT STATUS</small>
            <b>{st.label}</b>
            <p>{toilet.last_cleaned_at
              ? `Last cleaned: ${new Date(toilet.last_cleaned_at).toLocaleString('en-IN')}`
              : 'Not yet cleaned'}</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="detail-kpis">
          <article>
            <small>Units</small>
            <strong>{toilet.num_units || '—'}</strong>
            <span>inside</span>
          </article>
          <article>
            <small>Interval</small>
            <strong>{interval ? `${interval}m` : '—'}</strong>
            <span>cleaning cycle</span>
          </article>
          <article>
            <small>Complaints</small>
            <strong>{toilet.open_complaints || 0}</strong>
            <span>open</span>
          </article>
        </div>

        <footer>
          <button className="secondary" onClick={() => onScan(toilet.code)}>▦ Preview QR scan</button>
          <button className="primary" onClick={onClose}>Close</button>
        </footer>
      </aside>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({
  toilets, setToilets, notify, facilityId, facilityName,
  greeting, today, firstName, onNavigate, onScan, onToiletsChanged,
}) {
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // KPI counts
  const counts = useMemo(() => {
    let clean = 0, needsCleaning = 0, overdue = 0, cleaning = 0, maintenance = 0;
    for (const t of toilets) {
      const s = t.status || t.derived_status;
      if (s === 'CLEAN') clean++;
      else if (s === 'CLEANING') cleaning++;
      else if (s === 'NEEDS_CLEANING' || s === 'NOT_CLEANED') needsCleaning++;
      else if (s === 'OVERDUE') overdue++;
      else if (s === 'MAINTENANCE') maintenance++;
    }
    return { clean, needsCleaning, overdue, cleaning, maintenance, total: toilets.length };
  }, [toilets]);

  const actionRequired = counts.needsCleaning + counts.overdue + counts.maintenance;

  // Filter + search
  const visible = useMemo(() => {
    let list = toilets;
    if (filter === 'ACTION') {
      list = list.filter(t => ['NEEDS_CLEANING', 'NOT_CLEANED', 'OVERDUE', 'MAINTENANCE'].includes(t.status || t.derived_status));
    } else if (filter === 'CLEAN') {
      list = list.filter(t => (t.status || t.derived_status) === 'CLEAN');
    } else if (filter === 'CLEANING') {
      list = list.filter(t => (t.status || t.derived_status) === 'CLEANING');
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        `${t.name} ${t.code} ${t.floor || ''} ${t.area || ''}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [toilets, filter, search]);

  const FILTERS = [
    { id: 'ALL',     label: `All (${counts.total})` },
    { id: 'ACTION',  label: `Action Required (${actionRequired})` },
    { id: 'CLEANING',label: `Cleaning Now (${counts.cleaning})` },
    { id: 'CLEAN',   label: `Clean (${counts.clean})` },
  ];

  return (
    <>
      {/* Welcome row */}
      <div className="welcome-row">
        <div>
          <p>{today}</p>
          <h1>{greeting}, {firstName}.</h1>
          <span>Live cleanliness picture across <b>{facilityName}</b> — {counts.total} toilet{counts.total !== 1 ? 's' : ''} monitored.</span>
        </div>
        <button className="primary" onClick={() => onNavigate('facilities')}>＋ Add toilet</button>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip">
        <div className={`kpi-pill green ${filter === 'CLEAN' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'CLEAN' ? 'ALL' : 'CLEAN')} role="button" tabIndex={0}>
          <strong>{counts.clean}</strong>
          <span>✓ Clean</span>
        </div>
        <div className={`kpi-pill red ${filter === 'ACTION' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'ACTION' ? 'ALL' : 'ACTION')} role="button" tabIndex={0}>
          <strong>{counts.needsCleaning + counts.overdue}</strong>
          <span>! Needs Cleaning</span>
        </div>
        <div className={`kpi-pill amber ${filter === 'CLEANING' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'CLEANING' ? 'ALL' : 'CLEANING')} role="button" tabIndex={0}>
          <strong>{counts.cleaning}</strong>
          <span>◷ Cleaning Now</span>
        </div>
        <div className="kpi-pill ink">
          <strong>{counts.maintenance}</strong>
          <span>⚒ Maintenance</span>
        </div>
        <div className="kpi-pill ink">
          <strong>{counts.total > 0 ? Math.round((counts.clean / counts.total) * 100) : 0}%</strong>
          <span>↑ Uptime</span>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="toilet-wall-controls">
        <div className="tw-search">
          <span>⌕</span>
          <input
            placeholder="Search toilet name, code, floor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>×</button>}
        </div>
        <div className="tw-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={filter === f.id ? 'filter-active' : 'filter-btn'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toilet wall */}
      <div className="toilet-wall">
        {visible.length === 0 && toilets.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 40, marginBottom: 12 }}>◇</div>
            <h2>No toilets yet</h2>
            <p>Add your first toilet block to start monitoring cleanliness.</p>
            <button className="primary" onClick={() => onNavigate('facilities')}>＋ Add first toilet →</button>
          </div>
        )}
        {visible.length === 0 && toilets.length > 0 && (
          <div className="empty-state">
            <p style={{ color: 'var(--muted)', fontSize: 11 }}>No toilets match your current filter.</p>
            <button className="secondary" onClick={() => { setFilter('ALL'); setSearch(''); }}>Clear filter</button>
          </div>
        )}
        {visible.map(t => (
          <ToiletCard
            key={t.id}
            toilet={t}
            onOpen={setDetail}
            onScan={onScan}
          />
        ))}
      </div>

      {/* Toilet detail drawer */}
      {detail && (
        <ToiletDrawer
          toilet={detail}
          onClose={() => setDetail(null)}
          onScan={(code) => { setDetail(null); onScan(code); }}
        />
      )}
    </>
  );
}
