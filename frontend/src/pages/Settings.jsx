import React, { useState } from 'react';

export default function Settings({ notify, facilityName }) {
  const [language, setLanguage] = useState('English + Marathi');
  const [activeTab, setActiveTab] = useState('Branding');

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>SYSTEM / SETTINGS</p>
          <h1>CleanPulse settings</h1>
          <span>Facility branding, service levels, languages and operational rules.</span>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="panel settings-nav">
          {['Branding', 'Status engine', 'Cleaning schedule', 'SLA & escalation', 'Languages & audio', 'Notifications', 'Privacy & security', 'PWA & offline'].map(x => (
            <button className={activeTab === x ? 'active' : ''} key={x} onClick={() => setActiveTab(x)}>
              {x}<span>›</span>
            </button>
          ))}
        </aside>
        
        <section className="panel settings-form">
          <header>
            <div>
              <h2>Branding & identity</h2>
              <p>Configurable for any BMC or municipal facility.</p>
            </div>
            <span className="saved-state">✓ Saved</span>
          </header>
          
          <div className="logo-config">
            <span className="large-logo">CP</span>
            <div>
              <b>Organization logo</b>
              <small>PNG or SVG · recommended 512 × 512</small>
              <button onClick={() => notify('Logo picker opened')}>Change logo</button>
            </div>
          </div>
          
          <div className="form-grid">
            <label className="wide">Organization name
              <input defaultValue="Brihanmumbai Municipal Corporation" />
            </label>
            <label className="wide">Facility name
              <input defaultValue={facilityName || "BDBA Shatabdi Hospital"} />
            </label>
            <label>Primary colour
              <div className="color-input"><i /><input defaultValue="#087A53" /></div>
            </label>
            <label>Secondary colour
              <div className="color-input secondary-color"><i /><input defaultValue="#D49316" /></div>
            </label>
            <label className="wide">Languages
              <select value={language} onChange={e => setLanguage(e.target.value)}>
                <option>English + Marathi</option>
                <option>English only</option>
                <option>Marathi only</option>
                <option>English + Marathi + Hindi</option>
              </select>
            </label>
          </div>
          
          <div className="settings-preview">
            <span>LIVE PREVIEW</span>
            <div>
              <span className="large-logo small">CP</span>
              <div>
                <b>BMC CleanPulse</b>
                <small>Every Toilet. Always Accountable.</small>
              </div>
            </div>
          </div>
          
          <footer>
            <button className="secondary">Discard</button>
            <button className="primary" onClick={() => notify('Brand settings saved')}>Save changes</button>
          </footer>
        </section>
      </div>
    </section>
  );
}
