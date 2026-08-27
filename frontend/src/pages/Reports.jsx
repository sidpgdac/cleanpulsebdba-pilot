import React from 'react';

export default function Reports({ notify }) {
  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>QUALITY / REPORTS</p>
          <h1>Reports & exports</h1>
          <span>Decision-ready records for operational and management review.</span>
        </div>
        <div className="page-actions">
          <button className="primary" onClick={() => notify('Daily report generated')}>＋ Generate report</button>
        </div>
      </div>

      <div className="report-grid">
        {[
          ['Daily Cleanliness Report', 'Cleanliness uptime, open exceptions and completed cycles.', 'Today · PDF / CSV', '◎'],
          ['Cleaning Compliance', 'Scheduled vs completed cycles with photo-proof compliance.', 'Weekly · Excel / CSV', '✓'],
          ['Complaints & SLA', 'Issue categories, acknowledgement and resolution performance.', 'Monthly · PDF / CSV', '!'],
          ['Maintenance', 'Open tickets, downtime, unit availability and root causes.', 'Monthly · Excel / CSV', '⚒'],
          ['Cleaner Performance', 'Fair indicators excluding infrastructure failures.', 'Monthly · PDF', '★'],
          ['Supervisor Audits', 'Pass rates, failed controls and audit coverage.', 'Weekly · CSV', '▣'],
          ['Repeat Problems', 'Recurring toilets, issue mix and intervention recommendation.', 'Monthly · PDF', '↻'],
          ['Facility Comparison', 'Cleanliness and availability by building, floor and department.', 'Monthly · Excel', '▥']
        ].map((r, i) => (
          <article className="report-card panel" key={r[0]}>
            <span>{r[3]}</span>
            <div>
              <h2>{r[0]}</h2>
              <p>{r[1]}</p>
              <small>{r[2]}</small>
            </div>
            <button onClick={() => notify(`${r[0]} downloaded`)}>↓</button>
            {i === 0 && <em>Recommended</em>}
          </article>
        ))}
      </div>

      <section className="panel scheduled-reports">
        <header>
          <div>
            <h2>Scheduled reports</h2>
            <p>Future-ready delivery configuration</p>
          </div>
          <button className="secondary" onClick={() => notify('Report schedule form opened')}>＋ Add schedule</button>
        </header>
        <article>
          <span className="report-icon">M</span>
          <div>
            <b>Monday management brief</b>
            <small>Every Monday · 08:00 · Facility Admin & Medical Superintendent</small>
          </div>
          <em>Active</em>
          <button>•••</button>
        </article>
        <article>
          <span className="report-icon">D</span>
          <div>
            <b>Daily exception digest</b>
            <small>Daily · 18:00 · Supervisors</small>
          </div>
          <em>Active</em>
          <button>•••</button>
        </article>
      </section>
    </section>
  );
}
