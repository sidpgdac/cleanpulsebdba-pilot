import React, { useState, useMemo } from 'react';
import { statusMeta, relativeTime } from '../lib/data.js';

function mapStatus(t) {
  if (t.derived_status === 'MAINTENANCE') return 'maintenance';
  if (['NEEDS_CLEANING','NOT_CLEANED','OVERDUE'].includes(t.derived_status)) return 'alert';
  if (t.derived_status === 'CLEANING') return 'due';
  return 'clean';
}

export default function LiveStatus({ toilets, onOpenToilet, onScan, notify }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const visible = useMemo(() => {
    if (statusFilter === 'all') return toilets;
    return toilets.filter(t => mapStatus(t) === statusFilter);
  }, [toilets, statusFilter]);

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>OPERATIONS / LIVE STATUS</p>
          <h1>Live toilet wall</h1>
          <span>Exception-first status across {toilets.length} monitored toilet blocks.</span>
        </div>
        <div className="page-actions">
          <button className="secondary">⌕ Search</button>
          <button className="primary" onClick={onScan}>Open QR demo</button>
        </div>
      </div>

      <div className="filter-bar panel">
        <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>
          All <b>{toilets.length}</b>
        </button>
        {(['alert','maintenance','due','clean']).map(s => (
          <button key={s} className={`${s} ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {statusMeta[s].icon} {statusMeta[s].label}<b>{toilets.filter(t => mapStatus(t) === s).length}</b>
          </button>
        ))}
        <span />
        <select>
          <option>All floors</option>
          {[...new Set(toilets.map(t => t.floor).filter(Boolean))].map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      <div className="wall-grid">
        {visible.map(t => {
          const st = mapStatus(t);
          const sm = statusMeta[st];
          return (
            <button key={t.id} className={`wall-card ${st}`} onClick={() => onOpenToilet(t)}>
              <header>
                <span className={`status-badge ${st}`}>{sm.icon} {sm.label}</span>
                <small>•••</small>
              </header>
              <div className="wall-wc">WC</div>
              <h2>{t.name}</h2>
              <p>{t.code} · {t.floor || '—'}</p>
              {t.latest_issue
                ? <div className="wall-issue">{st === 'maintenance' ? '⚒' : '!'} {t.latest_issue}</div>
                : <div className="wall-clean">✓ {t.last_cleaned_at ? `Cleaned ${relativeTime(t.last_cleaned_at)}` : 'Not cleaned yet'}</div>
              }
              <footer>
                <span><small>Uptime</small><b>{t.uptime_pct ?? '—'}%</b></span>
                <span><small>Units open</small><b>{t.open_units ?? '—'}/{t.total_units ?? '—'}</b></span>
                <i>→</i>
              </footer>
            </button>
          );
        })}
        {visible.length === 0 && (
          <div style={{ gridColumn: 'span 3', padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
            No toilets match this filter.
          </div>
        )}
      </div>
    </section>
  );
}
