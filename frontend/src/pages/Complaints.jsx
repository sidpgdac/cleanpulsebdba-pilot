import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { Loader, CheckCircle2 } from 'lucide-react';

const KIND_LABEL = {
  HOUSEKEEPING: 'Cleaning',
  MAINTENANCE:  'Maintenance',
};

const CATEGORY_ICONS = {
  'Dirty toilet':       '🚽',
  'Wet / slippery floor': '💦',
  'Bad smell':          '◌',
  'No soap':            '🧼',
  'No water':           '🚱',
  'Bin full':           '▰',
  'Broken fixture':     '🔧',
  'Blocked toilet':     '⛔',
};

export default function Complaints({ facilityId, notify }) {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL | OPEN | HOUSEKEEPING | MAINTENANCE
  const [resolving, setResolving] = useState(null);

  async function loadFeedback() {
    if (!facilityId) return;
    try {
      const { data } = await supabase
        .from('feedback')
        .select('*, toilets(name, code, floor, area)')
        .eq('facility_id', facilityId)
        .order('created_at', { ascending: false });
      setFeedback(data || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadFeedback(); }, [facilityId]);

  async function resolve(id) {
    setResolving(id);
    try {
      await supabase
        .from('feedback')
        .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
        .eq('id', id);
      setFeedback(fs => fs.map(f => f.id === id ? { ...f, status: 'RESOLVED' } : f));
      notify('Issue marked as resolved');
    } catch {
      notify('Failed to resolve');
    } finally {
      setResolving(null);
    }
  }

  // Stats
  const open       = feedback.filter(f => f.status === 'OPEN');
  const resolved   = feedback.filter(f => f.status === 'RESOLVED');
  const cleaning   = open.filter(f => f.kind === 'HOUSEKEEPING');
  const maint      = open.filter(f => f.kind === 'MAINTENANCE');

  // Filtered list
  const visible = useMemo(() => {
    switch (filter) {
      case 'OPEN':         return open;
      case 'HOUSEKEEPING': return cleaning;
      case 'MAINTENANCE':  return maint;
      case 'RESOLVED':     return resolved;
      default:             return feedback;
    }
  }, [feedback, filter]);

  const TABS = [
    { id: 'ALL',         label: `All (${feedback.length})` },
    { id: 'OPEN',        label: `Open (${open.length})` },
    { id: 'HOUSEKEEPING',label: `Cleaning (${cleaning.length})` },
    { id: 'MAINTENANCE', label: `Maintenance (${maint.length})` },
    { id: 'RESOLVED',    label: `Resolved (${resolved.length})` },
  ];

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>COMPLAINTS</p>
          <h1>Citizen complaints</h1>
          <span>Anonymous feedback from citizens — resolve cleaning and maintenance issues.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('Complaints exported')}>↓ Export</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ marginBottom: 20 }}>
        <div className="kpi-pill red">
          <strong>{open.length}</strong>
          <span>! Open</span>
        </div>
        <div className="kpi-pill amber">
          <strong>{cleaning.length}</strong>
          <span>🧹 Cleaning</span>
        </div>
        <div className="kpi-pill ink">
          <strong>{maint.length}</strong>
          <span>⚒ Maintenance</span>
        </div>
        <div className="kpi-pill green">
          <strong>{resolved.length}</strong>
          <span>✓ Resolved</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={filter === t.id ? 'tab-active' : 'tab-btn'}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Complaint list */}
      {loading && (
        <div className="complaints-loading panel">
          <div className="complaints-loading-icon"><Loader size={18} className="spin" /></div>
          <div><b>Syncing citizen signal feed</b><span>Checking new housekeeping and maintenance reports…</span></div>
          <i /><i /><i />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div className="complaints-clear-icon"><CheckCircle2 size={28} /></div>
          <b style={{ fontSize: 13 }}>
            {filter === 'OPEN' || filter === 'ALL'
              ? 'No open complaints — all clear!'
              : `No ${filter.toLowerCase()} issues`}
          </b>
          <p style={{ color: 'var(--muted)', fontSize: 10, marginTop: 6 }}>
            Issues reported by citizens will appear here.
          </p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="complaints-list">
          {visible.map(f => {
            const isOpen = f.status === 'OPEN';
            const isMaint = f.kind === 'MAINTENANCE';
            const toilet = f.toilets || {};
            const categoryIcon = CATEGORY_ICONS[f.category] || (isMaint ? '⚒' : '!');

            return (
              <article key={f.id} className={`complaint-row panel ${isOpen ? (isMaint ? 'complaint-maint' : 'complaint-open') : 'complaint-resolved'}`}>
                <div className="complaint-icon">{categoryIcon}</div>

                <div className="complaint-body">
                  <div className="complaint-header">
                    <b className="complaint-category">{f.category || f.kind || 'Issue'}</b>
                    <span className={`complaint-kind-badge ${isMaint ? 'ink' : 'red'}`}>
                      {KIND_LABEL[f.kind] || f.kind || 'Unknown'}
                    </span>
                  </div>
                  <div className="complaint-toilet">
                    <span>📍 {toilet.name || '—'}</span>
                    <span style={{ color: 'var(--muted)' }}>{toilet.code}</span>
                    {toilet.floor && <span style={{ color: 'var(--muted)' }}>{toilet.floor}</span>}
                    {toilet.area  && <span style={{ color: 'var(--muted)' }}>{toilet.area}</span>}
                  </div>
                  <div className="complaint-meta">
                    <time>{relativeTime(f.created_at)}</time>
                    {f.status === 'RESOLVED' && f.resolved_at && (
                      <span style={{ color: 'var(--green)' }}>✓ Resolved {relativeTime(f.resolved_at)}</span>
                    )}
                  </div>
                </div>

                <div className="complaint-action">
                  {isOpen ? (
                    <button
                      className="primary"
                      style={{ padding: '6px 14px', fontSize: 10 }}
                      disabled={resolving === f.id}
                      onClick={() => resolve(f.id)}
                    >
                      {resolving === f.id ? '…' : 'Mark resolved'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>✓ Done</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
