import React, { useState } from 'react';
import { statusMeta } from '../lib/data.js';

export default function Audits({ toilets, notify }) {
  const [selected, setSelected] = useState('');
  
  const target = toilets.find(t => t.id === selected || t.code === selected) || toilets[0];
  
  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>QUALITY / AUDITS</p>
          <h1>15-Second Supervisor Audit</h1>
          <span>Pass/fail quality checks that feed directly into analytics.</span>
        </div>
      </div>

      <div className="audit-layout">
        <section className="audit-card panel">
          <header>
            <div>
              <span className="wc big">WC</span>
              <div>
                <h2>Audit: {target?.name || 'Select a toilet'}</h2>
                <p>{target?.code} · {target?.floor}</p>
              </div>
            </div>
            <select value={selected} onChange={e => setSelected(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 10 }}>
              {toilets.map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </header>
          
          <div className="audit-controls">
            {[
              ['Floor dry & mopped', '🧹'],
              ['Cubicles clean', '🚽'],
              ['Basin dry & clean', '🚰'],
              ['Soap filled', '🧼'],
              ['Dustbins empty', '🗑️'],
              ['No foul smell', '💨']
            ].map(([label, icon], i) => (
              <article key={i}>
                <span>{icon}</span>
                <b>{label}</b>
                <div>
                  <button className="pass active">Pass</button>
                  <button className="fail">Fail</button>
                </div>
              </article>
            ))}
          </div>
          
          <label className="audit-note">
            Additional notes (optional)
            <textarea placeholder="Any specific issues found during audit..." />
          </label>
          
          <footer>
            <span>Audit will be linked to your profile automatically.</span>
            <button className="primary" onClick={() => notify('Audit completed and saved')}>Submit audit →</button>
          </footer>
        </section>

        <section className="audit-summary panel">
          <div className="quality-ring">
            <span>100<small>%</small></span>
          </div>
          <h2>Pass rate</h2>
          <p>Last 7 days</p>
          <div>
            <span><small>Total audits</small><b>14</b></span>
            <span><small>Failed checks</small><b className="red-text">0</b></span>
            <span><small>Coverage</small><b>94%</b></span>
          </div>
        </section>
      </div>
    </section>
  );
}
