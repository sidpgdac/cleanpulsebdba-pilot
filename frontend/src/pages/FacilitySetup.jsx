import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { supabase, api } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';

const TOILET_TYPES = ['Male', 'Female', 'Unisex', 'Accessible', 'Staff', 'Other'];
const TYPE_ICONS = { Male: '♂', Female: '♀', Unisex: '⚥', Accessible: '♿', Staff: '◆', Other: 'WC' };
const INTERVALS = [
  { value: 60,  label: 'Every 1 hour' },
  { value: 90,  label: 'Every 90 min' },
  { value: 120, label: 'Every 2 hours' },
  { value: 180, label: 'Every 3 hours' },
  { value: 240, label: 'Every 4 hours' },
];

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_COLOR = {
  CLEAN: 'green', CLEANING: 'amber',
  NEEDS_CLEANING: 'red', NOT_CLEANED: 'red',
  OVERDUE: 'red', MAINTENANCE: 'ink',
};
const STATUS_LABEL = {
  CLEAN: 'Clean', CLEANING: 'Cleaning Now',
  NEEDS_CLEANING: 'Needs Cleaning', NOT_CLEANED: 'Not Cleaned',
  OVERDUE: 'Overdue', MAINTENANCE: 'Maintenance',
};

// ─── Tiny QR download helper ─────────────────────────────────────────────────
async function downloadQR(toilet) {
  const url = toilet.qr_url || `${window.location.origin}/t/${toilet.code}`;
  const data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', width: 400, margin: 2, color: { dark: '#073f31', light: '#ffffff' } });
  const a = document.createElement('a');
  a.href = data;
  a.download = `${toilet.code}-QR.png`;
  a.click();
}

// ─── Add Toilet Form ─────────────────────────────────────────────────────────
function AddToiletForm({ facilityId, onCreated, notify }) {
  const [form, setForm] = useState({
    name: '', floor: '', area: '',
    toilet_type: 'Male', num_units: 4, cleaning_interval_minutes: 120,
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { code, qrUrl }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data?.session?.user?.id;

      // Call the backend API (or fall back to direct RPC)
      const { data, error } = await supabase.rpc('create_toilet_with_qr', {
        p_facility_id: facilityId,
        p_building: form.floor || 'Main',
        p_floor: form.floor || 'Ground Floor',
        p_area: form.area || 'General',
        p_name: form.name,
        p_toilet_type: form.toilet_type,
        p_num_units: Number(form.num_units),
        p_cleaning_interval_minutes: Number(form.cleaning_interval_minutes),
        p_actor_id: userId || null,
        p_public_app_url: window.location.origin,
      });

      if (error) throw error;

      const code = data?.code || data?.toilet_code || '—';
      const qrUrl = data?.qr_url || `${window.location.origin}/t/${code}`;
      setCreated({ code, qrUrl, name: form.name });
      notify(`✓ "${form.name}" created — QR ready`);
      onCreated();

      // Reset form for next toilet
      setForm({ name: '', floor: form.floor, area: form.area, toilet_type: form.toilet_type, num_units: form.num_units, cleaning_interval_minutes: form.cleaning_interval_minutes });
    } catch (err) {
      notify('Error: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadQR() {
    if (!created) return;
    const data = await QRCode.toDataURL(created.qrUrl, {
      errorCorrectionLevel: 'H', width: 400, margin: 2,
      color: { dark: '#073f31', light: '#ffffff' },
    });
    const a = document.createElement('a');
    a.href = data;
    a.download = `${created.code}-QR.png`;
    a.click();
  }

  return (
    <div className="add-toilet-form panel">
      <div className="form-intro">
        <span style={{ fontSize: 24 }}>＋</span>
        <div>
          <h2>Add a toilet block</h2>
          <p>Fill in the details and a QR code will be generated instantly.</p>
        </div>
      </div>

      {/* Success flash */}
      {created && (
        <div className="toilet-created-flash">
          <span>✓</span>
          <div>
            <b>"{created.name}" created</b>
            <small>ID: {created.code}</small>
          </div>
          <button className="primary" onClick={handleDownloadQR}>↓ Download QR</button>
          <button onClick={() => setCreated(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="wide">
            Toilet name <span>e.g. "OPD Male Toilet"</span>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="OPD Male Toilet"
            />
          </label>

          <label>
            Floor / Level <span>e.g. Ground Floor</span>
            <input
              value={form.floor}
              onChange={e => set('floor', e.target.value)}
              placeholder="Ground Floor"
            />
          </label>

          <label>
            Area / Zone <span>e.g. Near Reception</span>
            <input
              value={form.area}
              onChange={e => set('area', e.target.value)}
              placeholder="Near Reception"
            />
          </label>

          <label>
            Type
            <select value={form.toilet_type} onChange={e => set('toilet_type', e.target.value)}>
              {TOILET_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>
              ))}
            </select>
          </label>

          <label>
            Units inside <span>Number of stalls</span>
            <input
              type="number" min="1" max="50"
              value={form.num_units}
              onChange={e => set('num_units', e.target.value)}
            />
          </label>

          <label>
            Cleaning interval
            <select value={form.cleaning_interval_minutes} onChange={e => set('cleaning_interval_minutes', e.target.value)}>
              {INTERVALS.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-footer">
          <p style={{ fontSize: 9, color: 'var(--muted)' }}>A permanent QR code will be generated automatically.</p>
          <button type="submit" className="primary large" disabled={busy || !form.name.trim()}>
            {busy ? 'Creating…' : 'Create & generate QR →'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Toilet Row ───────────────────────────────────────────────────────────────
function ToiletRow({ toilet, onDeactivate, notify }) {
  const s = toilet.status || toilet.derived_status || 'NOT_CLEANED';
  const color = STATUS_COLOR[s] || 'ink';
  const label = STATUS_LABEL[s] || s;

  return (
    <tr>
      <td>
        <b style={{ fontSize: 11 }}>{toilet.name}</b>
        <br />
        <small style={{ color: 'var(--muted)' }}>{toilet.code}</small>
      </td>
      <td>
        <span style={{ fontSize: 10 }}>
          {[toilet.floor, toilet.area].filter(Boolean).join(' · ') || toilet.building || '—'}
        </span>
      </td>
      <td>
        <span style={{ fontSize: 9 }}>{TYPE_ICONS[toilet.toilet_type] || 'WC'} {toilet.toilet_type || 'Other'}</span>
      </td>
      <td style={{ textAlign: 'center', fontSize: 10 }}>
        {toilet.num_units || '—'}
      </td>
      <td>
        <span className={`status-dot-label ${color}`}>
          <i style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${color === 'red' ? 'red' : color === 'green' ? 'green' : color === 'amber' ? 'amber' : 'ink'})`, display: 'inline-block', marginRight: 5 }} />
          {label}
        </span>
      </td>
      <td style={{ fontSize: 9, color: 'var(--muted)' }}>
        {toilet.last_cleaned_at ? relativeTime(toilet.last_cleaned_at) : 'Never'}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="secondary"
            style={{ padding: '4px 10px', fontSize: 9 }}
            onClick={() => downloadQR(toilet)}
          >
            ↓ QR
          </button>
          <button
            className="danger-link"
            style={{ fontSize: 9 }}
            onClick={() => onDeactivate(toilet)}
          >
            Deactivate
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Facilities Page ─────────────────────────────────────────────────────────
export default function Facilities({ toilets, setToilets, facilityId, facilityName, notify, onToiletsChanged }) {
  const [tab, setTab] = useState('toilets'); // 'toilets' | 'add' | 'info'
  const [facilityInfo, setFacilityInfo] = useState(null);
  const [search, setSearch] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(false);

  // Load facility info
  useEffect(() => {
    if (!facilityId || facilityInfo) return;
    setLoadingInfo(true);
    supabase.from('facilities').select('*').eq('id', facilityId).single()
      .then(({ data }) => setFacilityInfo(data || {}))
      .catch(() => {})
      .finally(() => setLoadingInfo(false));
  }, [facilityId]);

  const filteredToilets = useMemo(() => {
    if (!search) return toilets;
    const q = search.toLowerCase();
    return toilets.filter(t =>
      `${t.name} ${t.code} ${t.floor || ''} ${t.area || ''}`.toLowerCase().includes(q)
    );
  }, [toilets, search]);

  async function deactivateToilet(toilet) {
    if (!confirm(`Deactivate "${toilet.name}"? The QR code will stop working.`)) return;
    try {
      await supabase.from('toilets').update({ active: false }).eq('id', toilet.id);
      setToilets(ts => ts.filter(t => t.id !== toilet.id));
      notify(`"${toilet.name}" deactivated`);
    } catch (err) {
      notify('Error: ' + err.message);
    }
  }

  const TABS = [
    { id: 'toilets', label: `Toilets (${toilets.length})` },
    { id: 'add',     label: '＋ Add Toilet' },
    { id: 'info',    label: '◇ Facility Info' },
  ];

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>FACILITIES</p>
          <h1>{facilityName || 'Facility'}</h1>
          <span>Manage toilet blocks, QR codes, and facility settings.</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab-active' : 'tab-btn'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Toilet List ── */}
      {tab === 'toilets' && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Search bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--edge)' }}>
            <div className="tw-search" style={{ maxWidth: 400 }}>
              <span>⌕</span>
              <input
                placeholder="Search name, code, floor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {toilets.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>◇</div>
              <h2>No toilets added yet</h2>
              <p>Create your first toilet block to generate a QR code.</p>
              <button className="primary" onClick={() => setTab('add')}>＋ Add first toilet →</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name / Code</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>Units</th>
                    <th>Status</th>
                    <th>Last Cleaned</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredToilets.map(t => (
                    <ToiletRow
                      key={t.id}
                      toilet={t}
                      onDeactivate={deactivateToilet}
                      notify={notify}
                    />
                  ))}
                </tbody>
              </table>
              {filteredToilets.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>
                  No toilets match your search.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Add Toilet ── */}
      {tab === 'add' && (
        <AddToiletForm
          facilityId={facilityId}
          notify={notify}
          onCreated={() => {
            onToiletsChanged();
            // Stay on add tab so admin can add more toilets one by one
          }}
        />
      )}

      {/* ── Tab: Facility Info ── */}
      {tab === 'info' && (
        <div className="panel form-card" style={{ maxWidth: 560 }}>
          <div className="form-intro">
            <span style={{ fontSize: 24 }}>◇</span>
            <div>
              <h2>Facility information</h2>
              <p>These details appear on all QR cards and the dashboard.</p>
            </div>
          </div>
          {loadingInfo ? (
            <p style={{ color: 'var(--muted)', fontSize: 10 }}>Loading…</p>
          ) : (
            <div className="form-grid">
              <label className="wide">Facility name
                <input readOnly value={facilityInfo?.name || ''} style={{ color: 'var(--ink)', fontWeight: 600 }} />
              </label>
              <label>Code <span>Used in QR IDs (permanent)</span>
                <input readOnly value={facilityInfo?.code || ''} style={{ color: 'var(--ink)', fontWeight: 600 }} />
              </label>
              <label className="wide">Facility ID
                <input readOnly value={facilityId || ''} style={{ color: 'var(--muted)', fontSize: 9 }} />
              </label>
            </div>
          )}
          <div className="form-footer">
            <p style={{ fontSize: 9, color: 'var(--muted)' }}>Facility name and code are set during initial setup. Contact your administrator to change them.</p>
          </div>
        </div>
      )}
    </section>
  );
}
