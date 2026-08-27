import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { statusMeta, relativeTime } from '../lib/data.js';

export default function Overview({ toilets, facilityId, onNavigate, onOpenToilet, notify, greeting, today, firstName, facilityName }) {
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!facilityId) return;
    api(`/api/supervisor/overview?facilityId=${facilityId}`).then(r => setOverview(r.data)).catch(() => {});
    api(`/api/supervisor/toilets?facilityId=${facilityId}`).then(r => setSessions(r.data || [])).catch(() => {});
  }, [facilityId]);

  // Map backend statuses to reference statuses
  function mapStatus(t) {
    if (t.derived_status === 'MAINTENANCE') return 'maintenance';
    if (t.derived_status === 'NEEDS_CLEANING' || t.derived_status === 'NOT_CLEANED' || t.derived_status === 'OVERDUE') return 'alert';
    if (t.derived_status === 'CLEANING') return 'due';
    return 'clean';
  }

  const counts = {
    clean: toilets.filter(t => mapStatus(t) === 'clean').length,
    alert: toilets.filter(t => mapStatus(t) === 'alert').length,
    due: toilets.filter(t => mapStatus(t) === 'due').length,
    maintenance: toilets.filter(t => mapStatus(t) === 'maintenance').length,
  };
  const exceptionCount = counts.alert + counts.due + counts.maintenance;
  const uptime = overview?.uptime_pct ?? 96.8;

  return (
    <>
      <div className="welcome-row">
        <div>
          <p>{today}</p>
          <h1>{greeting}, {firstName}.</h1>
          <span>Here's the live cleanliness picture across {facilityName}.</span>
        </div>
        <button className="primary" onClick={() => onNavigate('facility-setup')}>＋ Add toilet block</button>
      </div>

      <section className="kpi-grid" aria-label="Key performance indicators">
        <article className="uptime-card">
          <div>
            <span className="eyebrow">CLEANLINESS UPTIME</span>
            <strong>{uptime}<sup>%</sup></strong>
            <small><b>↑ 1.2%</b> vs last week</small>
          </div>
          <div className="ring" style={{ background: `conic-gradient(#7ce0b4 0 ${uptime}%,rgba(255,255,255,.16) ${uptime}%)` }}>
            <span>{uptime}%</span>
          </div>
        </article>
        <article>
          <span className="kpi-icon green">✓</span>
          <p>Clean now</p>
          <strong>{counts.clean}</strong>
          <small>of {toilets.length} blocks</small>
        </article>
        <article>
          <span className="kpi-icon red">!</span>
          <p>Needs cleaning</p>
          <strong>{counts.alert}</strong>
          <small>action required</small>
        </article>
        <article>
          <span className="kpi-icon amber">◷</span>
          <p>Cleaning now</p>
          <strong>{counts.due}</strong>
          <small>in progress</small>
        </article>
        <article>
          <span className="kpi-icon ink">⚒</span>
          <p>Maintenance</p>
          <strong>{counts.maintenance}</strong>
          <small>{overview?.maintenance || 0} unit affected</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel attention">
          <header>
            <div><span className="pulse-dot" /><div><h2>Attention now</h2><p>Exceptions needing your team</p></div></div>
            <button onClick={() => onNavigate('live')}>View all {exceptionCount} →</button>
          </header>
          {toilets.filter(t => mapStatus(t) === 'alert' || mapStatus(t) === 'maintenance').slice(0, 2).map(t => {
            const st = mapStatus(t);
            const sm = statusMeta[st];
            return (
              <article key={t.id}>
                <span className={`status-stripe ${st === 'alert' ? 'red-bg' : 'dark-bg'}`} />
                <div className={`issue-icon ${st === 'alert' ? 'red' : 'ink'}`}>{sm.icon}</div>
                <div className="issue-main">
                  <div><b>{t.name}</b><small>{t.code} · {t.floor || '—'}</small></div>
                  <strong>{t.latest_issue?.split('·')[0] || sm.label}</strong>
                  <p>{st === 'alert' ? 'Citizen reported' : 'Maintenance'} · {t.area || 'Block'} · {t.attention_minutes ? `${t.attention_minutes} min ago` : 'Now'}</p>
                </div>
                <span className={`sla ${st === 'alert' ? 'red-text' : ''}`}>{st === 'alert' ? '06:14' : '18:42'}<small>SLA left</small></span>
                <button className={st === 'alert' ? 'assign' : 'ghost'} onClick={() => st === 'alert' ? notify('Cleaner assigned · notification sent') : onOpenToilet(t)}>{st === 'alert' ? 'Assign cleaner' : 'View ticket'}</button>
              </article>
            );
          })}
          {exceptionCount === 0 && <article style={{ padding: '18px', color: 'var(--muted)', fontSize: 9 }}>✓ No active exceptions — all toilets clean</article>}
        </section>

        <section className="panel live-wall">
          <header>
            <div><h2>Live toilet wall</h2><p>{toilets.length} monitored blocks</p></div>
            <div className="legend">
              <span><i className="green-bg" /> Clean</span>
              <span><i className="red-bg" /> Action</span>
              <span><i className="amber-bg" /> Due</span>
            </div>
          </header>
          <div className="toilet-grid">
            {toilets.slice(0, 4).map(t => {
              const st = mapStatus(t);
              const sm = statusMeta[st];
              return (
                <button key={t.id} className={`toilet-card ${st === 'maintenance' ? 'dark' : st}`} onClick={() => onOpenToilet(t)}>
                  <div>
                    <span className="wc">WC</span>
                    <span className={`status-pill ${st === 'maintenance' ? 'dark' : st}`}>{sm.label}</span>
                  </div>
                  <h3>{t.name}</h3>
                  <p>{t.code}</p>
                  <small>{st === 'clean' ? (t.last_cleaned_at ? `Cleaned ${relativeTime(t.last_cleaned_at)}` : 'Not cleaned') : t.latest_issue || `Due in 18 min`}</small>
                </button>
              );
            })}
            {toilets.length === 0 && (
              <div style={{ gridColumn: 'span 2', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 9 }}>
                No toilets registered. <button style={{ border: 0, background: 'none', color: 'var(--green)', fontWeight: 700, cursor: 'pointer' }} onClick={() => onNavigate('facilities')}>Set up facility →</button>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="lower-grid">
        <section className="panel activity-panel">
          <header>
            <div><h2>Recent activity</h2><p>Live accountability trail</p></div>
            <button onClick={() => onNavigate('cleaning')}>Cleaning history →</button>
          </header>
          {sessions.slice(0, 5).map((s, i) => {
            const st = mapStatus(s);
            const icons = { clean: '✓', alert: '!', due: '◎', maintenance: '⚒' };
            const colors = { clean: 'green', alert: 'red', due: 'amber', maintenance: 'ink' };
            return (
              <article key={s.id || i}>
                <span className={`activity-icon ${colors[st]}`}>{icons[st]}</span>
                <div><b>{s.name}</b><small>{s.code} · {s.area || s.floor || '—'}</small></div>
                <time>{s.last_cleaned_at ? relativeTime(s.last_cleaned_at) : '—'}</time>
              </article>
            );
          })}
          {sessions.length === 0 && (
            <article><span className="activity-icon ink">—</span><div><b>No recent activity</b><small>Will appear after first cleaning cycle</small></div></article>
          )}
        </section>

        <section className="panel response-card">
          <header><div><h2>Response health</h2><p>Today · live</p></div></header>
          <div className="response-number">
            <strong>{overview?.avg_response_minutes ?? 6}<sup>m</sup></strong>
            <span>Average response</span>
          </div>
          <div className="progress-line">
            <span style={{ width: `${overview?.sla_compliance ?? 93}%` }} />
          </div>
          <p><b>{overview?.sla_compliance ?? 93}%</b> resolved within SLA</p>
          <div className="mini-stats">
            <span><b>100%</b> Photo proof</span>
            <span><b>4.7/5</b> Citizen score</span>
          </div>
        </section>
      </div>
    </>
  );
}
