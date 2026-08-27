import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function InternalUnits({ facilityId, toilets, notify }) {
  const [selected, setSelected] = useState('');
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  const currentToilet = toilets.find(t => t.id === selected || t.code === selected) || toilets[0];

  useEffect(() => {
    if (toilets.length > 0 && !selected) setSelected(toilets[0].id || toilets[0].code);
  }, [toilets]);

  useEffect(() => {
    if (!currentToilet) return;
    setLoading(true);
    api(`/api/admin/units?toiletId=${currentToilet.id}`).then(r => {
      setUnits(r.data || []);
    }).catch(() => setUnits([])).finally(() => setLoading(false));
  }, [currentToilet?.id]);

  async function toggleUnit(unit) {
    try {
      await api(`/api/admin/units/${unit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ operational: !unit.operational })
      });
      setUnits(us => us.map(u => u.id === unit.id ? { ...u, operational: !u.operational, issue: !u.operational ? undefined : 'Marked unavailable' } : u));
      notify('Unit updated');
    } catch {
      notify('Failed to update unit');
    }
  }

  async function addUnit() {
    try {
      const r = await api(`/api/admin/units`, {
        method: 'POST',
        body: JSON.stringify({ toiletId: currentToilet.id, unitType: 'Western WC' })
      });
      if (r.data) setUnits(us => [...us, r.data]);
      notify('Unit added');
    } catch {
      notify('Failed to add unit');
    }
  }

  const openCount = units.filter(u => u.operational !== false).length;

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>ASSETS / INTERNAL UNITS</p>
          <h1>Internal unit management</h1>
          <span>Quick-edit availability without turning one broken cubicle into a closed toilet.</span>
        </div>
      </div>

      <div className="toolbar panel">
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          {toilets.map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
        </select>
        <div className="availability">
          <span>Operational availability</span>
          <b>{openCount} / {units.length}</b>
          <em>{units.length ? Math.round(openCount / units.length * 100) : 0}%</em>
        </div>
        <button className="secondary" onClick={addUnit}>＋ Add unit</button>
      </div>

      {currentToilet && (
        <section className="unit-editor panel">
          <header>
            <div>
              <h2>{currentToilet.name}</h2>
              <p>{currentToilet.code} · {currentToilet.floor || '—'} · {currentToilet.area || '—'}</p>
            </div>
            <span className="status-pill clean">Overall open</span>
          </header>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>Loading units…</div>
          ) : (
            <div className="unit-list">
              {units.map((u, i) => (
                <article key={u.id || i}>
                  <span className="unit-number">U{String(i + 1).padStart(2, '0')}</span>
                  <label>Display label<input defaultValue={u.label || u.unit_code} /></label>
                  <label>Unit type
                    <select defaultValue={u.unit_type || 'Western WC'}>
                      <option>Western WC</option>
                      <option>Indian WC</option>
                      <option>Accessible WC</option>
                      <option>Urinal</option>
                      <option>Basin Area</option>
                      <option>Common Area</option>
                    </select>
                  </label>
                  <div className="unit-state">
                    <span className={u.operational !== false ? 'ok-dot' : 'dark-dot'} />
                    {u.operational !== false ? 'Operational' : (u.issue || 'Unavailable')}
                  </div>
                  <button className={`toggle ${u.operational !== false ? 'on' : ''}`} onClick={() => toggleUnit(u)}>
                    <i />
                  </button>
                </article>
              ))}
              {units.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>No units found for this toilet.</div>
              )}
            </div>
          )}
          <footer>
            <span>Changes saved immediately.</span>
            <button className="primary" onClick={() => notify('Unit configuration saved')}>Save changes</button>
          </footer>
        </section>
      )}
    </section>
  );
}
