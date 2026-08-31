import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { supabase, api } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle, Search, Building2, QrCode, Download, X } from 'lucide-react';

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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="add-toilet-form panel">
      <div className="form-intro">
        <div className="form-icon"><Plus size={32} /></div>
        <div>
          <h2>Add a toilet block</h2>
          <p>Fill in the details and a QR code will be generated instantly.</p>
        </div>
      </div>

      {/* Success flash */}
      <AnimatePresence>
        {created && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="toilet-created-flash" style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--green-bg)', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid var(--green)' }}>
            <CheckCircle color="var(--green)" />
            <div style={{ flex: 1 }}>
              <b style={{ color: 'var(--text-main)', display: 'block' }}>"{created.name}" created</b>
              <small style={{ color: 'var(--text-muted)' }}>ID: {created.code}</small>
            </div>
            <button type="button" className="primary" onClick={handleDownloadQR}><Download size={14} /> Download QR</button>
            <button type="button" onClick={() => setCreated(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

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
          <button type="button" className="ghost" onClick={() => setForm({ name: '', floor: '', area: '', toilet_type: 'Male', num_units: 4, cleaning_interval_minutes: 120 })}>Clear</button>
          <button type="submit" className="primary large" disabled={busy || !form.name.trim()}>
            {busy ? 'Creating...' : 'Create toilet block'} <Plus size={16} />
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Editable Toilet Row ───────────────────────────────────────────────────────
function ToiletRow({ toilet, onDeactivate, notify, onToiletClick }) {
  const [editing, setEditing] = useState(null); // field name being edited
  const [form, setForm] = useState(toilet);
  
  const s = toilet.status || toilet.derived_status || 'NOT_CLEANED';
  const color = STATUS_COLOR[s] || 'ink';
  const label = STATUS_LABEL[s] || s;

  async function saveField(field, value) {
    setEditing(null);
    if (toilet[field] === value) return; // no change
    
    // Optimistic update
    setForm(prev => ({ ...prev, [field]: value }));
    
    try {
      const { error } = await supabase.from('toilets').update({ [field]: value }).eq('id', toilet.id);
      if (error) throw error;
      notify(`✓ Saved ${field}`);
    } catch (err) {
      notify(`Error saving ${field}`);
      setForm(prev => ({ ...prev, [field]: toilet[field] })); // Revert
    }
  }

  function handleBlur(field, e) {
    saveField(field, e.target.value);
  }

  function handleKey(field, e) {
    if (e.key === 'Enter') {
      saveField(field, e.target.value);
    }
  }

  return (
    <tr>
      <td onClick={() => setEditing('name')}>
        {editing === 'name' ? (
          <input className="inline-edit-input" autoFocus defaultValue={form.name} onBlur={e => handleBlur('name', e)} onKeyDown={e => handleKey('name', e)} />
        ) : (
          <>
            <b style={{ fontSize: 13 }}>{form.name}</b>
            <br />
            <span className="code-tag">{toilet.code}</span>
          </>
        )}
      </td>
      <td onClick={() => setEditing('floor')}>
        {editing === 'floor' ? (
          <input className="inline-edit-input" autoFocus defaultValue={form.floor} onBlur={e => handleBlur('floor', e)} onKeyDown={e => handleKey('floor', e)} placeholder="Floor..." />
        ) : (
          <span style={{ fontSize: 12 }}>{form.floor || '—'}</span>
        )}
      </td>
      <td onClick={() => setEditing('area')}>
        {editing === 'area' ? (
          <input className="inline-edit-input" autoFocus defaultValue={form.area} onBlur={e => handleBlur('area', e)} onKeyDown={e => handleKey('area', e)} placeholder="Area..." />
        ) : (
          <span style={{ fontSize: 12 }}>{form.area || '—'}</span>
        )}
      </td>
      <td onClick={() => setEditing('cleaning_interval_minutes')}>
        {editing === 'cleaning_interval_minutes' ? (
          <select className="inline-edit-input" autoFocus defaultValue={form.cleaning_interval_minutes} onBlur={e => handleBlur('cleaning_interval_minutes', e)}>
            {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 12 }}>{form.cleaning_interval_minutes}m</span>
        )}
      </td>
      <td>
        <span className={`tc-status-pill`} style={{ color: `var(--${color})`, border: `1px solid var(--${color})` }}>
          {label}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          {onToiletClick && (
            <button className="secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => onToiletClick(toilet)}>
              Detail
            </button>
          )}
          <button className="primary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => downloadQR(toilet)}>↓ QR</button>
          <button className="ghost" style={{ padding: '4px 10px', fontSize: 10, color: 'var(--red)' }} onClick={() => onDeactivate(toilet)}>Deactivate</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Facilities Page ─────────────────────────────────────────────────────────
export default function Facilities({ toilets, setToilets, facilityId, facilityName, notify, onToiletsChanged, onToiletClick }) {
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
    { id: 'add',     label: <><Plus size={16} /> Add Toilet</> },
    { id: 'info',    label: <><Building2 size={16} /> Facility Info</> },
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
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
            <div className="tw-search" style={{ maxWidth: 400 }}>
              <Search className="search-icon" size={16} />
              <input
                placeholder="Search name, code, floor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {toilets.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state" style={{ padding: '48px 24px' }}>
              <Building2 size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
              <h2>No toilets added yet</h2>
              <p>Create your first toilet block to generate a QR code.</p>
              <button className="primary" onClick={() => setTab('add')}><Plus size={16} /> Add first toilet</button>
            </motion.div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="editable-table">
                <thead>
                  <tr>
                    <th>Name / Code</th>
                    <th>Floor</th>
                    <th>Area</th>
                    <th>Interval</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <motion.tbody initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}>
                  {filteredToilets.map(t => (
                    <motion.tr key={t.id} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                      <td colSpan="6" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                          <ToiletRow
                              toilet={t}
                              onDeactivate={deactivateToilet}
                              notify={notify}
                              onToiletClick={onToiletClick}
                            />
                          </tbody>
                        </table>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
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
            <div className="form-icon"><Building2 size={32} /></div>
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
