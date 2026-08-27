import React from 'react';

export default function Maintenance({ toilets, notify }) {
  const maintenanceToilets = toilets.filter(t => t.derived_status === 'MAINTENANCE');

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>OPERATIONS / MAINTENANCE</p>
          <h1>Maintenance control</h1>
          <span>Infrastructure failures stay separate from housekeeping performance.</span>
        </div>
        <div className="page-actions">
          <button className="primary" onClick={() => notify('New maintenance ticket form opened')}>＋ New ticket</button>
        </div>
      </div>

      {maintenanceToilets.length > 0 && (
        <div className="root-cause-banner">
          <span>⚒</span>
          <div>
            <small>ROOT-CAUSE INTELLIGENCE</small>
            <h2>{maintenanceToilets[0].name} needs engineering—not repeat cleaning.</h2>
            <p>Infrastructure issue detected. Cleaning will not resolve this problem.</p>
          </div>
          <button onClick={() => notify('Escalated to Facility Engineering')}>Escalate to Engineering →</button>
        </div>
      )}

      <section className="master-table panel">
        <div className="table-tools">
          <div><b>Open maintenance tickets</b><small>Sorted by SLA risk</small></div>
          <select><option>All priorities</option><option>P1</option><option>P2</option></select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Toilet</th><th>Location</th><th>Issue</th><th>Status</th><th>Priority</th><th />
              </tr>
            </thead>
            <tbody>
              {maintenanceToilets.map(t => (
                <tr key={t.id}>
                  <td><b className="mono-id">{t.code}</b></td>
                  <td><b>{t.name}</b><small>{t.floor || '—'}</small></td>
                  <td><b>{t.latest_issue || 'Maintenance required'}</b><small>Infrastructure</small></td>
                  <td><span className="status-pill dark">Maintenance</span></td>
                  <td><span className="priority p1">P1</span></td>
                  <td><button className="row-menu" onClick={() => notify('Ticket opened')}>•••</button></td>
                </tr>
              ))}
              {maintenanceToilets.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No active maintenance tickets ✓</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
