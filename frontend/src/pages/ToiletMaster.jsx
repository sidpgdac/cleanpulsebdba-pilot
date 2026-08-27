import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import { statusMeta } from '../lib/data.js';

function mapStatus(t) {
  if (t.derived_status === 'MAINTENANCE') return 'maintenance';
  if (['NEEDS_CLEANING','NOT_CLEANED','OVERDUE'].includes(t.derived_status)) return 'alert';
  if (t.derived_status === 'CLEANING') return 'due';
  return 'clean';
}

export default function ToiletMaster({ facilityId, onOpenToilet, notify }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusF, setStatusF] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    api(`/api/admin/toilets?facilityId=${facilityId}`)
      .then(r => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [facilityId]);

  const visible = useMemo(() => rows.filter(t => {
    const txt = `${t.id} ${t.code} ${t.name} ${t.floor || ''} ${t.area || ''} ${t.building || ''}`.toLowerCase();
    if (query && !txt.includes(query.toLowerCase())) return false;
    if (statusF && mapStatus(t) !== statusF) return false;
    return true;
  }), [rows, query, statusF]);

  function exportCsv() {
    const cols = ['Code','Name','Building','Floor','Area','Type','Status'];
    const data = [cols, ...rows.map(t => [t.code, t.name, t.building||'', t.floor||'', t.area||'', t.toilet_type||'', mapStatus(t)])];
    const csv = data.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'toilet-master.csv';
    a.click();
    notify('Toilet master exported');
  }

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>ASSETS / TOILET MASTER</p>
          <h1>Toilet master</h1>
          <span>Permanent IDs with editable operational details.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={exportCsv}>↓ Export</button>
          <button className="primary" onClick={() => notify('Add toilet coming soon')}>＋ Add toilet</button>
        </div>
      </div>

      <section className="master-table panel">
        <div className="table-tools">
          <div className="table-search">
            <span>⌕</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by ID, name, floor or area" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)}>
            <option value="">All statuses</option>
            <option value="clean">Clean</option>
            <option value="alert">Action required</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>Loading…</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Permanent ID</th>
                  <th>Toilet block</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Interval</th>
                  <th>Status</th>
                  <th>QR</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map(t => {
                  const st = mapStatus(t);
                  const sm = statusMeta[st];
                  return (
                    <tr key={t.id}>
                      <td><b className="mono-id">{t.code}</b></td>
                      <td><b>{t.name}</b><small>{t.building || '—'}</small></td>
                      <td>{t.floor || '—'}<small>{t.area || '—'}</small></td>
                      <td>{t.toilet_type || '—'}</td>
                      <td><b>{t.total_units || '—'}</b><small>{t.open_units ?? '—'} operational</small></td>
                      <td>{t.cleaning_interval_minutes || 120} min</td>
                      <td><span className={`status-pill ${st === 'maintenance' ? 'dark' : st}`}>{sm.label}</span></td>
                      <td><span className="green-text">● Active</span></td>
                      <td><button className="row-menu" onClick={() => onOpenToilet(t)}>•••</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer>Showing {visible.length} of {rows.length} toilet blocks <span>‹ <b>1</b> ›</span></footer>
      </section>
    </section>
  );
}
