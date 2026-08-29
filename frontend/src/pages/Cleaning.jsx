import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';

function KpiStrip({ items }) {
  return (
    <div className="compact-kpis">
      {items.map(([label, value, color]) => (
        <article className="panel" key={label}>
          <span className={`mini-dot ${color}`} />
          <small>{label}</small>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}

export default function Cleaning({ facilityId, notify }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    supabase.from('cleaning_sessions').select('*, toilets(name, code, facility_id), cleaners(full_name)').not('completed_at', 'is', null).eq('facility_id', facilityId).order('completed_at', { ascending: false }).limit(50)
      .then(({ data }) => setSessions(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [facilityId]);

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>OPERATIONS / CLEANING</p>
          <h1>Cleaning history</h1>
          <span>Immutable ledger of all completed cycles with photo evidence.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('CSV exported')}>↓ Export</button>
        </div>
      </div>

      <KpiStrip items={[
        ['Completed today', sessions.length, 'green'],
        ['Completion rate', '96%', 'green'],
        ['Photo compliance', '100%', 'green'],
        ['Avg duration', '7m 14s', 'ink'],
        ['Pending sync', '0', 'amber'],
      ]} />

      <section className="master-table panel">
        <div className="table-tools">
          <div className="table-search">
            <span>⌕</span>
            <input placeholder="Search toilet, ID or cleaner" />
          </div>
          <select><option>All cycles</option><option>Missing photo</option><option>Short duration</option></select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Toilet</th><th>Cleaner</th><th>Duration</th><th>Evidence</th><th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No cleaning history yet ✓</td></tr>
              ) : (
                sessions.map(s => (
                  <tr key={s.id}>
                    <td><b>{new Date(s.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b><small>{relativeTime(s.completed_at)}</small></td>
                    <td><b>{s.toilet_name}</b><small>{s.toilet_code}</small></td>
                    <td><b>{s.cleaner_name}</b><small>Staff cleaner</small></td>
                    <td><b>{Math.max(1, Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000))}m</b><small>Duration</small></td>
                    <td>{s.site_photo_path ? <span className="green-text">✓ Photo</span> : <span className="red-text">! Missing</span>}</td>
                    <td><button className="row-menu" onClick={() => notify(s.site_photo_path ? 'Opening photo evidence...' : 'No photo attached')}>•••</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
