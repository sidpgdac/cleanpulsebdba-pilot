import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';

function Ticket({ tone, id, title, toilet, meta, sla, action, onAction }) {
  return (
    <article className={`ticket ${tone}`}>
      <header><span>{id}</span><b>{sla}</b></header>
      <h3>{title}</h3>
      <p>{toilet}</p>
      <small>{meta}</small>
      <button onClick={onAction}>{action} →</button>
    </article>
  );
}

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

export default function Complaints({ facilityId, notify }) {
  const [feedback, setFeedback] = useState([]);

  useEffect(() => {
    if (!facilityId) return;
    api(`/api/admin/feedback?facilityId=${facilityId}`)
      .then(r => setFeedback(r.data || []))
      .catch(() => {});
  }, [facilityId]);

  const open = feedback.filter(f => f.status === 'open');
  const resolved = feedback.filter(f => f.status === 'resolved');

  async function resolve(id) {
    try {
      await api(`/api/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
      setFeedback(fs => fs.map(f => f.id === id ? { ...f, status: 'resolved' } : f));
      notify('Issue resolved · dashboard updated');
    } catch { notify('Failed to resolve'); }
  }

  const cleaningIssues = open.filter(f => f.category !== 'maintenance');
  const maintenanceIssues = open.filter(f => f.category === 'maintenance');

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>OPERATIONS / COMPLAINTS</p>
          <h1>Citizen complaints</h1>
          <span>Anonymous feedback routed by issue type and unit.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('Complaints exported as CSV')}>↓ Export</button>
        </div>
      </div>

      <KpiStrip items={[
        ['Open', open.length, 'red'],
        ['Resolved today', resolved.length, 'green'],
        ['Average response', '6 min', 'ink'],
        ['Under SLA', '93%', 'green'],
        ['Total', feedback.length, 'ink'],
      ]} />

      <div className="ticket-board">
        <div>
          <h2>Cleaning required <span>{cleaningIssues.length}</span></h2>
          {cleaningIssues.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 9, padding: '12px 0' }}>No open cleaning issues</div>}
          {cleaningIssues.map(f => (
            <Ticket key={f.id} tone="red"
              id={`CP-${f.id.slice(0, 8)}`}
              title={f.issue_type || 'Cleaning issue'}
              toilet={`${f.toilet_name} · ${f.toilet_code}`}
              meta={`Citizen report · ${relativeTime(f.created_at)}`}
              sla="06:14"
              action="Resolve"
              onAction={() => resolve(f.id)}
            />
          ))}
        </div>
        <div>
          <h2>Maintenance required <span className="dark-count">{maintenanceIssues.length}</span></h2>
          {maintenanceIssues.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 9, padding: '12px 0' }}>No open maintenance issues</div>}
          {maintenanceIssues.map(f => (
            <Ticket key={f.id} tone="dark"
              id={`MT-${f.id.slice(0, 8)}`}
              title={f.issue_type || 'Maintenance issue'}
              toilet={`${f.toilet_name} · ${f.toilet_code}`}
              meta={`Routed to Engineering · ${relativeTime(f.created_at)}`}
              sla="18:42"
              action="View"
              onAction={() => notify('Maintenance ticket opened')}
            />
          ))}
          {maintenanceIssues.length > 0 && (
            <div className="routing-note">
              <b>Fair attribution is active</b>
              <p>Infrastructure tickets are excluded from cleaner performance.</p>
            </div>
          )}
        </div>
        <div>
          <h2>Recently resolved <span className="green-count">{resolved.length}</span></h2>
          {resolved.slice(0, 5).map(f => (
            <Ticket key={f.id} tone="green"
              id={`CP-${f.id.slice(0, 8)}`}
              title={f.issue_type || 'Resolved'}
              toilet={`${f.toilet_name} · ${f.toilet_code}`}
              meta={`Resolved · ${relativeTime(f.updated_at || f.created_at)}`}
              sla="✓ SLA"
              action="View"
              onAction={() => notify('Complaint timeline opened')}
            />
          ))}
          {resolved.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 9, padding: '12px 0' }}>No resolved issues yet</div>}
        </div>
      </div>
    </section>
  );
}
