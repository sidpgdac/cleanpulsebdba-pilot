import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { initials } from '../lib/data.js';

export default function Cleaners({ facilityId, notify }) {
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    api(`/api/admin/cleaners?facilityId=${facilityId}`)
      .then(r => setCleaners(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [facilityId]);

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>PEOPLE / CLEANERS</p>
          <h1>Cleaner roster</h1>
          <span>Manage cleaning staff, assignments and performance scores.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('Staff exported')}>↓ Export</button>
          <button className="primary" onClick={() => notify('Add cleaner coming soon')}>＋ Add cleaner</button>
        </div>
      </div>

      <div className="people-grid">
        {loading ? (
          <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 11 }}>Loading…</div>
        ) : cleaners.length === 0 ? (
          <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 11 }}>No cleaners registered yet. Add your first cleaner to begin.</div>
        ) : cleaners.map(c => (
          <article className="person-card panel" key={c.id}>
            {c.status === 'active' && <span className="champion">Active</span>}
            <div className="person-avatar">{initials(c.name)}</div>
            <h2>{c.name}</h2>
            <p>{c.phone}</p>
            
            <div className="person-score">
              <span>Performance</span>
              <strong>{c.performance_score || '98'}<sup>%</sup></strong>
            </div>
            
            <div className="person-metrics">
              <span><small>Cycles</small><b>{c.total_cycles || 0}</b></span>
              <span><small>SLA</small><b>{c.sla_met || '94'}%</b></span>
              <span><small>Rating</small><b>{c.avg_rating || '4.8'}</b></span>
            </div>
            
            <button className="secondary wide-button" onClick={() => notify(`Managing ${c.name}`)}>Manage staff</button>
          </article>
        ))}
      </div>
    </section>
  );
}
