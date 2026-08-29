import React, { useEffect, useState } from 'react';
import { api, supabase } from '../lib/api.js';
import { initials, relativeTime } from '../lib/data.js';

export default function Cleaners({ facilityId, notify }) {
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: '', pin: '', pin_confirm: '' });
  const [formError, setFormError] = useState('');

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
          <button className="secondary" onClick={() => notify('Staff exported')}>↓ Export</button>
          <button className="primary" onClick={() => setShowAdd(s => !s)}>＋ Add cleaner</button>
        </div>
      </div>

      {showAdd && (
        <form className="panel" style={{ padding: 24, marginBottom: 20 }} onSubmit={addCleaner}>
          <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 16, marginBottom: 16 }}>New cleaner</h2>
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
            <div style={{ color: 'var(--red)', fontSize: 10, padding: '8px 0' }}>{formError}</div>
          )}
          <div className="form-footer">
            <p style={{ fontSize: 9, color: 'var(--muted)' }}>PIN is hashed server-side and never stored in plain text.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create cleaner →'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="people-grid">
        {loading ? (
          <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 11 }}>Loading…</div>
        ) : cleaners.length === 0 ? (
          <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 11 }}>
            No cleaners registered yet. Add your first cleaner to begin operations.
          </div>
        ) : cleaners.map(c => (
          <article className="person-card panel" key={c.id}>
            {c.active && <span className="champion">Active</span>}
            {!c.active && <span className="champion" style={{ background: 'var(--ink)', color: '#fff' }}>Inactive</span>}
            <div className="person-avatar">{initials(c.full_name)}</div>
            <h2>{c.full_name}</h2>
            <p style={{ fontSize: 9, color: 'var(--muted)' }}>Added {relativeTime(c.created_at)}</p>
            
            <div className="person-metrics">
              <span><small>Status</small><b>{c.active ? 'Active' : 'Inactive'}</b></span>
            </div>
            
            <button
              className={c.active ? 'secondary wide-button' : 'primary wide-button'}
              onClick={() => toggleActive(c)}
            >
              {c.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
