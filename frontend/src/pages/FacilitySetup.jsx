import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { supabase, api } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, Search, Building2, Download, X,
  QrCode, ChevronDown, Settings, Trash2, Clock,
  MapPin, Grid, Edit3, AlertTriangle
} from 'lucide-react';

const TOILET_TYPES = ['Male', 'Female', 'Unisex', 'Accessible', 'Staff', 'Other'];
const TYPE_ICONS   = { Male: '♂', Female: '♀', Unisex: '⚥', Accessible: '♿', Staff: '◆', Other: 'WC' };
const INTERVALS    = [
  { value: 60,  label: '1 hr' },
  { value: 90,  label: '90 min' },
  { value: 120, label: '2 hrs' },
  { value: 180, label: '3 hrs' },
  { value: 240, label: '4 hrs' },
];

const STATUS_COLOR = {
  CLEAN: 'green', CLEANING: 'amber',
  NEEDS_CLEANING: 'red', NOT_CLEANED: 'red',
  OVERDUE: 'red', MAINTENANCE: 'dark',
};
const STATUS_LABEL = {
  CLEAN: 'Clean', CLEANING: 'Cleaning Now',
  NEEDS_CLEANING: 'Needs Cleaning', NOT_CLEANED: 'Not Cleaned',
  OVERDUE: 'Overdue', MAINTENANCE: 'Maintenance',
};

async function downloadQR(toilet) {
  const url = toilet.qr_url || `${window.location.origin}/t/${toilet.code}`;
  const data = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H', width: 512, margin: 2,
    color: { dark: '#073f31', light: '#ffffff' },
  });
  const a = document.createElement('a');
  a.href = data; a.download = `${toilet.code}-QR.png`; a.click();
}

// ─── Add Toilet Slide Panel ────────────────────────────────────────────────────
function AddToiletPanel({ facilityId, onCreated, notify, onClose }) {
  const [form, setForm] = useState({
    name: '', floor: '', area: '',
    toilet_type: 'Male', num_units: 4, cleaning_schedule: ['08:00', '13:00', '17:00', '21:00'],
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data?.session?.user?.id;
      const { data, error } = await supabase.rpc('create_toilet_with_qr', {
        p_facility_id: facilityId,
        p_building: form.floor || 'Main',
        p_floor: form.floor || 'Ground Floor',
        p_area: form.area || 'General',
        p_name: form.name,
        p_toilet_type: form.toilet_type,
        p_num_units: Number(form.num_units),
        p_cleaning_schedule: form.cleaning_schedule,
        p_actor_id: userId || null,
        p_public_app_url: window.location.origin,
      });
      if (error) throw error;
      const code = data?.code || data?.toilet_code || '—';
      const qrUrl = data?.qr_url || `${window.location.origin}/t/${code}`;
      setCreated({ code, qrUrl, name: form.name });
      notify(`✓ "${form.name}" created — QR ready`);
      onCreated();
      setForm(f => ({ ...f, name: '' }));
    } catch (err) { notify('Error: ' + err.message); }
    finally { setBusy(false); }
  }

  async function handleDownloadQR() {
    if (!created) return;
    const data = await QRCode.toDataURL(created.qrUrl, {
      errorCorrectionLevel: 'H', width: 512, margin: 2,
      color: { dark: '#073f31', light: '#ffffff' },
    });
    const a = document.createElement('a'); a.href = data;
    a.download = `${created.code}-QR.png`; a.click();
  }

  return (
    <motion.div
      className="fac-add-panel"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="fac-add-header">
        <div>
          <div className="fac-add-title">Add Toilet Block</div>
          <div className="fac-add-sub">QR code generated instantly on creation</div>
        </div>
        {onClose && (
          <button className="fac-add-close" onClick={onClose}><X size={16} /></button>
        )}
      </div>

      {/* Success flash */}
      <AnimatePresence>
        {created && (
          <motion.div
            className="fac-created-flash"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          >
            <CheckCircle size={18} />
            <div className="fac-flash-text">
              <b>"{created.name}" created!</b>
              <span>Code: {created.code}</span>
            </div>
            <motion.button className="fac-flash-dl" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleDownloadQR}>
              <Download size={13} /> QR
            </motion.button>
            <button className="fac-flash-x" onClick={() => setCreated(null)}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="fac-form">
        <div className="fac-form-field">
          <label>Toilet Name *</label>
          <input required placeholder="e.g. OPD Male Toilet" value={form.name} onChange={e => set('name', e.target.value)} disabled={busy} />
        </div>
        <div className="fac-form-row">
          <div className="fac-form-field">
            <label>Floor / Level</label>
            <input placeholder="Ground Floor" value={form.floor} onChange={e => set('floor', e.target.value)} />
          </div>
          <div className="fac-form-field">
            <label>Area / Zone</label>
            <input placeholder="Near Reception" value={form.area} onChange={e => set('area', e.target.value)} />
          </div>
        </div>
        <div className="fac-form-row">
          <div className="fac-form-field">
            <label>Type</label>
            <select value={form.toilet_type} onChange={e => set('toilet_type', e.target.value)}>
              {TOILET_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
            </select>
          </div>
          <div className="fac-form-field">
            <label>Stalls Inside</label>
            <input type="number" min="1" max="50" value={form.num_units} onChange={e => set('num_units', e.target.value)} />
          </div>
        </div>
        <div className="fac-form-field">
          <label>Cleaning Schedule (Times per day)</label>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
            {form.cleaning_schedule.map((time, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 6, padding: '2px' }}>
                <input 
                  type="time" 
                  value={time} 
                  required
                  onChange={e => {
                    const n = [...form.cleaning_schedule];
                    n[i] = e.target.value;
                    set('cleaning_schedule', n);
                  }}
                  style={{ width: 100, border: 'none', background: 'transparent', padding: '4px' }}
                />
                <button 
                  type="button" 
                  onClick={() => set('cleaning_schedule', form.cleaning_schedule.filter((_, idx) => idx !== i))}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button 
              type="button" 
              onClick={() => set('cleaning_schedule', [...form.cleaning_schedule, '12:00'])}
              style={{ background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              + Add Time
            </button>
          </div>
        </div>
        <motion.button
          type="submit"
          className="fac-submit-btn"
          disabled={busy || !form.name.trim()}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        >
          {busy ? 'Creating…' : <><Plus size={15} /> Create Toilet Block</>}
        </motion.button>
      </form>
    </motion.div>
  );
}

// ─── Toilet Table Row ──────────────────────────────────────────────────────────
function ToiletRow({ toilet, onDeactivate, notify, onToiletClick, index }) {
  const s = toilet.status || toilet.derived_status || 'NOT_CLEANED';
  const color = STATUS_COLOR[s] || 'dark';
  const label = STATUS_LABEL[s] || s;

  return (
    <motion.tr
      className={`fac-row fac-row-${color}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <td className="fac-td-num">{index + 1}</td>
      <td>
        <div className="fac-td-name">{toilet.name}</div>
        <div className="fac-td-code">{toilet.code}</div>
      </td>
      <td><span className="fac-td-text">{toilet.floor || '—'}</span></td>
      <td><span className="fac-td-text">{toilet.area || '—'}</span></td>
      <td>
        <span className="fac-type-pill">{TYPE_ICONS[toilet.toilet_type] || 'WC'} {toilet.toilet_type || '—'}</span>
      </td>
      <td>
        <span className="fac-td-text">{toilet.cleaning_interval_minutes || 120}m</span>
      </td>
      <td>
        <span className={`fac-status-pill fac-status-${color}`}>{label}</span>
      </td>
      <td>
        <div className="fac-actions">
          {onToiletClick && (
            <motion.button
              className="fac-act-btn detail"
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={() => onToiletClick(toilet)}
              title="View details"
            >
              <Edit3 size={13} />
            </motion.button>
          )}
          <motion.button
            className="fac-act-btn qr"
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            onClick={() => downloadQR(toilet)}
            title="Download QR"
          >
            <Download size={13} /> QR
          </motion.button>
          <motion.button
            className="fac-act-btn del"
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            onClick={() => onDeactivate(toilet)}
            title="Deactivate"
          >
            <Trash2 size={13} />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Facilities({ toilets, setToilets, facilityId, facilityName, notify, onToiletsChanged, onToiletClick }) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return toilets;
    const q = search.toLowerCase();
    return toilets.filter(t =>
      `${t.name} ${t.code} ${t.floor || ''} ${t.area || ''} ${t.toilet_type || ''}`.toLowerCase().includes(q)
    );
  }, [toilets, search]);

  // Stats
  const stats = useMemo(() => {
    let clean = 0, due = 0, issue = 0;
    toilets.forEach(t => {
      const s = t.status || t.derived_status || 'NOT_CLEANED';
      const c = STATUS_COLOR[s];
      if (c === 'green') clean++;
      else if (c === 'amber') due++;
      else issue++;
    });
    return { total: toilets.length, clean, due, issue };
  }, [toilets]);

  async function deactivateToilet(toilet) {
    if (!confirm(`Deactivate "${toilet.name}"? The QR code will stop working.`)) return;
    try {
      await supabase.from('toilets').update({ active: false }).eq('id', toilet.id);
      setToilets(ts => ts.filter(t => t.id !== toilet.id));
      notify(`"${toilet.name}" deactivated`);
    } catch (err) { notify('Error: ' + err.message); }
  }

  return (
    <section className="page-stack">
      {/* Header */}
      <div className="fac-page-header">
        <div>
          <div className="fac-breadcrumb">FACILITIES</div>
          <h1 className="fac-title">{facilityName || 'Facility'}</h1>
          <p className="fac-subtitle">Manage toilet blocks, QR codes, and cleaning intervals.</p>
        </div>
        <motion.button
          className="fac-add-trigger"
          onClick={() => setShowAdd(v => !v)}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          {showAdd ? 'Cancel' : 'Add Toilet'}
        </motion.button>
      </div>

      {/* Quick Stats */}
      <div className="fac-stats-strip">
        {[
          { label: 'Total', value: stats.total, color: 'neutral' },
          { label: 'Clean', value: stats.clean, color: 'green' },
          { label: 'Due', value: stats.due, color: 'amber' },
          { label: 'Alert', value: stats.issue, color: 'red' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`fac-stat-card fac-stat-${color}`}>
            <div className="fac-stat-val">{value}</div>
            <div className="fac-stat-lbl">{label}</div>
          </div>
        ))}
      </div>

      {/* Main Layout: Table + (optional) Add Panel */}
      <div className={`fac-layout ${showAdd ? 'with-panel' : ''}`}>
        {/* Table section */}
        <div className="panel fac-table-panel" style={{ padding: 0, overflow: 'hidden', flex: 1, minWidth: 0 }}>
          {/* Toolbar */}
          <div className="fac-toolbar">
            <div className="ev2-search" style={{ flex: 1, maxWidth: 380 }}>
              <Search size={14} className="ev2-search-icon" />
              <input
                placeholder="Search name, code, floor, area…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="ev2-search-input"
              />
              {search && <button className="ev2-search-clear" onClick={() => setSearch('')}><X size={12} /></button>}
            </div>
            <div className="fac-toolbar-count">
              <span>{filtered.length}</span> toilets
            </div>
          </div>

          {/* Table */}
          {toilets.length === 0 ? (
            <div className="fac-empty-state">
              <Building2 size={44} strokeWidth={1.5} />
              <h3>No toilets yet</h3>
              <p>Click "Add Toilet" to create your first toilet block and generate its QR code.</p>
              <motion.button
                className="fac-submit-btn" style={{ marginTop: 8, width: 'auto', padding: '0.7rem 1.5rem' }}
                whileHover={{ scale: 1.03 }} onClick={() => setShowAdd(true)}
              >
                <Plus size={15} /> Add First Toilet
              </motion.button>
            </div>
          ) : (
            <div className="fac-table-scroll">
              <table className="fac-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name / Code</th>
                    <th>Floor</th>
                    <th>Area</th>
                    <th>Type</th>
                    <th>Interval</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="fac-table-empty">No toilets match "{search}"</td></tr>
                  ) : filtered.map((t, i) => (
                    <ToiletRow
                      key={t.id}
                      toilet={t}
                      index={i}
                      onDeactivate={deactivateToilet}
                      notify={notify}
                      onToiletClick={onToiletClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Toilet Panel */}
        <AnimatePresence>
          {showAdd && (
            <AddToiletPanel
              facilityId={facilityId}
              notify={notify}
              onCreated={() => { onToiletsChanged(); }}
              onClose={() => setShowAdd(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
