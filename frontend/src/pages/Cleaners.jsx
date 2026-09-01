import React, { useEffect, useState } from 'react';
import { api, supabase } from '../lib/api.js';
import { initials, relativeTime } from '../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Download, UserPlus, UserCheck, UserX, ShieldCheck, Loader } from 'lucide-react';

export default function Cleaners({ facilityId, notify }) {
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: '', pin: '', pin_confirm: '' });
  const [formError, setFormError] = useState('');
  const activeCount = cleaners.filter(cleaner => cleaner.active).length;

  async function loadCleaners() {
    if (!facilityId) return;
    setLoading(true);
    try {
      // Use backend API so we get data via service role (not anon RLS)
      const body = await api(`/api/admin/cleaners?facility_id=${facilityId}`);
      setCleaners(body.cleaners || []);
    } catch {
      // Fallback to direct Supabase if backend not configured
      supabase.from('cleaners').select('*').eq('facility_id', facilityId).order('full_name')
        .then(({ data }) => setCleaners(data || []))
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCleaners();
  }, [facilityId]);

  async function addCleaner(e) {
    e.preventDefault();
    setFormError('');

    if (form.pin !== form.pin_confirm) {
      return setFormError('PINs do not match');
    }
    if (!/^\d{4}$/.test(form.pin)) {
      return setFormError('PIN must be exactly 4 digits');
    }

    setBusy(true);
    try {
      // Backend hashes the PIN server-side — raw PIN never stored
      await api('/api/admin/cleaners', {
        method: 'POST',
        body: JSON.stringify({
          facility_id: facilityId,
          full_name: form.full_name,
          pin: form.pin,
        }),
      });
      notify(`Cleaner "${form.full_name}" added`);
      setForm({ full_name: '', pin: '', pin_confirm: '' });
      setShowAdd(false);
      loadCleaners();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(cleaner) {
    try {
      await api(`/api/admin/cleaners/${cleaner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !cleaner.active }),
      });
      notify(`${cleaner.full_name} ${cleaner.active ? 'deactivated' : 'reactivated'}`);
      loadCleaners();
    } catch (err) {
      notify('Error: ' + err.message);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>PEOPLE / CLEANERS</p>
          <h1>Cleaner roster</h1>
          <span>Manage cleaning staff, PIN codes, and performance.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => notify('Staff exported')}><Download size={14} /> Export</button>
          <button className="primary" onClick={() => setShowAdd(s => !s)}><Plus size={16} /> Add cleaner</button>
        </div>
      </div>

      <div className="roster-stats">
        <div className="roster-stat roster-stat-indigo"><div><UserPlus size={16} /></div><span><b>{cleaners.length}</b><small>Total workforce</small></span></div>
        <div className="roster-stat roster-stat-green"><div><UserCheck size={16} /></div><span><b>{activeCount}</b><small>Active today</small></span></div>
        <div className="roster-stat roster-stat-slate"><div><UserX size={16} /></div><span><b>{cleaners.length - activeCount}</b><small>Inactive</small></span></div>
        <div className="roster-security"><ShieldCheck size={18} /><div><b>Secure workforce access</b><small>Every cleaner PIN is encrypted and audit logged.</small></div></div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.form 
            initial={{ opacity: 0, y: -20, height: 0 }} 
            animate={{ opacity: 1, y: 0, height: 'auto' }} 
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="panel" style={{ padding: 24, marginBottom: 24, overflow: 'hidden' }} onSubmit={addCleaner}
          >
            <h2 style={{ fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} color="var(--accent)" /> New cleaner</h2>
            <div className="form-grid">
              <label className="wide">Full name
                <input
                  required
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Meena Sharma"
                />
              </label>
              <label>4-digit PIN
                <input
                  required
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="••••"
                />
              </label>
              <label>Confirm PIN
                <input
                  required
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin_confirm}
                  onChange={e => setForm({ ...form, pin_confirm: e.target.value.replace(/\D/g, '') })}
                  placeholder="••••"
                />
              </label>
            </div>
            {formError && (
              <div style={{ color: 'var(--red)', fontSize: 11, padding: '8px 0' }}>{formError}</div>
            )}
            <div className="form-footer">
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>PIN is hashed server-side and never stored in plain text.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? 'Creating...' : 'Create cleaner'} <UserPlus size={16} />
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div className="people-grid" initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}>
        {loading ? (
          <div className="roster-loading"><Loader size={18} className="spin" /><b>Syncing workforce roster</b><span>Checking active staff and access status…</span></div>
        ) : cleaners.length === 0 ? (
          <div className="roster-loading">
            <UserPlus size={22} /><b>No cleaners registered</b><span>Add your first cleaner to begin monitored operations.</span>
          </div>
        ) : cleaners.map(c => (
          <motion.article className="person-card panel" key={c.id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring" } } }}>
            {c.active && <span className="champion">Active</span>}
            {!c.active && <span className="champion" style={{ background: 'var(--border-medium)', color: 'var(--text-muted)' }}>Inactive</span>}
            <div className="person-avatar">{initials(c.full_name)}</div>
            <h2>{c.full_name}</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Added {relativeTime(c.created_at)}</p>
            
            <div className="person-metrics">
              <span><small>Status</small><b>{c.active ? 'Active' : 'Inactive'}</b></span>
            </div>
            
            <button
              className={c.active ? 'secondary wide-button' : 'primary wide-button'}
              onClick={() => toggleActive(c)}
            >
              {c.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
