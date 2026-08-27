import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function FacilitySetup({ notify }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState({
    org: 'Brihanmumbai Municipal Corporation',
    facility: 'BDBA Shatabdi Hospital',
    code: 'BDBA',
    base: 'https://bmc-cleanpulse.pdmumbaidacs.chatgpt.site',
    count: 10,
    interval: 120,
    unitQr: false,
  });

  const idPreview = `${setup.code || 'CODE'}-T001`;

  async function createMaster() {
    setBusy(true);
    try {
      await api('/api/admin/facilities', {
        method: 'POST',
        body: JSON.stringify({
          name: setup.facility,
          short_code: setup.code,
          organization: setup.org,
          toilet_count: Number(setup.count),
          base_url: setup.base,
          default_interval: Number(setup.interval),
        }),
      });
      notify(`Facility created · ${setup.count} permanent toilet IDs generated`);
      setStep(2);
    } catch (e) {
      notify('Error: ' + e.message);
    }
    setBusy(false);
  }

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>ASSETS / FACILITIES</p>
          <h1>Facility setup</h1>
          <span>Create the permanent toilet master in a few guided steps.</span>
        </div>
      </div>

      <div className="wizard-steps">
        <span className={step >= 1 ? 'active' : ''}><b>1</b> Facility</span>
        <i /><span className={step >= 2 ? 'active' : ''}><b>2</b> Toilet master</span>
        <i /><span className={step >= 3 ? 'active' : ''}><b>3</b> Review</span>
      </div>

      {step === 1 && (
        <section className="form-card panel">
          <div className="form-intro">
            <span className="building-icon">▥</span>
            <div>
              <h2>Facility information</h2>
              <p>These details will appear across dashboards and printable QR cards.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="wide">Organization<span>Official municipal or facility organization</span>
              <input value={setup.org} onChange={e => setSetup({ ...setup, org: e.target.value })} />
            </label>
            <label className="wide">Facility name<span>Public-facing name</span>
              <input value={setup.facility} onChange={e => setSetup({ ...setup, facility: e.target.value })} />
            </label>
            <label>Short code<span>Used in permanent IDs</span>
              <input maxLength={8} value={setup.code} onChange={e => setSetup({ ...setup, code: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase() })} />
              <small className="input-hint">Preview: {idPreview}</small>
            </label>
            <label>Toilet blocks<span>How many physical entrances?</span>
              <input type="number" min="1" max="500" value={setup.count} onChange={e => setSetup({ ...setup, count: Number(e.target.value) })} />
            </label>
            <label className="wide">Portal base URL<span>The permanent destination encoded in every QR</span>
              <input value={setup.base} onChange={e => setSetup({ ...setup, base: e.target.value })} />
            </label>
            <label>Default cleaning interval<span>Minutes between cycles</span>
              <select value={setup.interval} onChange={e => setSetup({ ...setup, interval: Number(e.target.value) })}>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
                <option value="180">180 minutes</option>
              </select>
            </label>
            <label className="toggle-row">Individual unit QR<span>Optional · off by default</span>
              <button type="button" className={`toggle ${setup.unitQr ? 'on' : ''}`} onClick={() => setSetup({ ...setup, unitQr: !setup.unitQr })}><i /></button>
            </label>
          </div>
          <div className="form-footer">
            <p>IDs are permanent. Names and schedules can change later.</p>
            <button className="primary large" disabled={busy} onClick={createMaster}>
              {busy ? 'Creating…' : 'Create toilet master →'}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="form-card panel" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, color: 'var(--green)', marginBottom: 16 }}>✓</div>
          <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 24, margin: '0 0 8px' }}>{setup.count} toilet IDs created</h2>
          <p style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 24 }}>
            Permanent IDs from {setup.code}-T001 to {setup.code}-T{String(setup.count).padStart(3, '0')} are now active.
          </p>
          <button className="primary large" onClick={() => setStep(3)}>Continue to review →</button>
        </section>
      )}

      {step === 3 && (
        <section className="form-card panel" style={{ padding: 32 }}>
          <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 20, margin: '0 0 18px' }}>Setup complete</h2>
          <div className="form-grid">
            {[['Organization', setup.org], ['Facility', setup.facility], ['Code', setup.code], ['Toilets', setup.count], ['Interval', `${setup.interval} min`]].map(([k, v]) => (
              <label key={k}>{k}<input readOnly value={v} style={{ color: 'var(--ink)', fontWeight: 600 }} /></label>
            ))}
          </div>
          <div className="form-footer">
            <p>Facility is live. Add cleaners to start operations.</p>
            <button className="primary large" onClick={() => window.location.reload()}>Go to dashboard →</button>
          </div>
        </section>
      )}
    </section>
  );
}
