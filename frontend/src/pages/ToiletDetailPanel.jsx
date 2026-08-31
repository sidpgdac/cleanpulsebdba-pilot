import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Printer, Clock, AlertTriangle, Settings,
  ChevronRight, MapPin, QrCode, CheckCircle, Hash
} from 'lucide-react';
import { relativeTime } from '../lib/data.js';
import { supabase } from '../lib/api.js';

const STATUS_META = {
  CLEAN:          { label: 'Clean',          color: 'green' },
  CLEANING:       { label: 'Cleaning Now',   color: 'orange' },
  NEEDS_CLEANING: { label: 'Needs Cleaning', color: 'orange' },
  NOT_CLEANED:    { label: 'Not Cleaned',    color: 'red' },
  OVERDUE:        { label: 'Overdue',        color: 'red' },
  MAINTENANCE:    { label: 'Maintenance',    color: 'dark' },
};

const TYPE_LABELS = {
  Male: '♂ Male', Female: '♀ Female', Unisex: '⚥ Unisex',
  Accessible: '♿ Accessible', Staff: '◆ Staff', Other: 'WC Other'
};

const INTERVAL_LABELS = {
  60: 'Every 1 hour', 90: 'Every 90 min', 120: 'Every 2 hours',
  180: 'Every 3 hours', 240: 'Every 4 hours'
};

export default function ToiletDetailPanel({ toilet, onClose, onNavigate, notify }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [lastSession, setLastSession] = useState(null);

  const qrUrl = toilet.qr_url || `${window.location.origin}/t/${toilet.code}`;
  const st = STATUS_META[toilet.status || toilet.derived_status] || STATUS_META.NOT_CLEANED;

  // Generate high-res QR code
  useEffect(() => {
    QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQrDataUrl).catch(console.error);
  }, [qrUrl]);

  // Load most recent completed cleaning session
  useEffect(() => {
    supabase
      .from('cleaning_sessions')
      .select('id, completed_at, started_at, gps_lat, gps_lng, cleaners(full_name)')
      .eq('toilet_id', toilet.id)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastSession(data?.[0] || null));
  }, [toilet.id]);

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${toilet.code}-QR.png`;
    a.click();
    notify?.('QR downloaded');
  }

  function printQR() {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>QR — ${toilet.name}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { display: flex; flex-direction: column; align-items: center; justify-content: center;
             min-height: 100vh; font-family: 'Arial', sans-serif; background: #fff; gap: 10px; }
      img { width: 200px; height: 200px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
      .name { font-size: 15px; font-weight: 700; color: #0f172a; }
      .code { font-size: 11px; color: #64748b; font-family: monospace; }
      .brand { font-size: 10px; color: #94a3b8; margin-top: 4px; }
      .url { font-size: 9px; color: #cbd5e1; word-break: break-all; max-width: 220px; text-align: center; }
    </style></head>
    <body>
      <img src="${qrDataUrl}" alt="QR Code" />
      <span class="name">${toilet.name}</span>
      <span class="code">${toilet.code}</span>
      <span class="brand">CleanPulse · BMC Health</span>
      <span class="url">${qrUrl}</span>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }</script>
    </body></html>`);
    win.document.close();
  }

  const duration = lastSession?.completed_at && lastSession?.started_at
    ? Math.max(1, Math.round((new Date(lastSession.completed_at) - new Date(lastSession.started_at)) / 60000))
    : null;

  const infoRows = [
    { label: 'Toilet Name',        value: toilet.name,                              bold: true },
    { label: 'Code',               value: toilet.code,                              mono: true },
    { label: 'Type',               value: TYPE_LABELS[toilet.toilet_type] || '—' },
    { label: 'Floor',              value: toilet.floor || '—' },
    { label: 'Area / Block',       value: toilet.area || '—' },
    { label: 'Building',           value: toilet.building || '—' },
    { label: 'Total Units',        value: toilet.total_units ? `${toilet.total_units} cubicles` : '—' },
    { label: 'Cleaning Interval',  value: INTERVAL_LABELS[toilet.cleaning_interval_minutes] || `${toilet.cleaning_interval_minutes || '—'} min` },
    { label: 'Status',             value: st.label,                                 color: st.color },
    { label: 'Last Cleaned',       value: toilet.last_cleaned_at ? relativeTime(toilet.last_cleaned_at) : 'Never' },
    { label: 'Last Cleaner',       value: toilet.last_cleaner_name || lastSession?.cleaners?.full_name || '—' },
    { label: 'Last Duration',      value: duration ? `${duration} min` : '—' },
    { label: 'GPS Verified',       value: lastSession?.gps_lat ? '✓ Yes' : '—',     color: lastSession?.gps_lat ? 'green' : undefined },
    { label: 'Open Complaints',    value: String(toilet.open_complaints ?? 0),      color: (toilet.open_complaints > 0) ? 'red' : 'green' },
    { label: 'Created',            value: toilet.created_at ? new Date(toilet.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
    { label: 'Toilet ID',          value: toilet.id,                                mono: true, small: true },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.aside
        className="detail-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        aria-label="Toilet detail panel"
      >
        {/* ── Header ── */}
        <div className="dp-header">
          <div className="dp-header-info">
            <p className="dp-eyebrow">TOILET DETAIL</p>
            <h2 className="dp-title">{toilet.name}</h2>
            <div className={`dp-status-badge ${st.color}`}>{st.label}</div>
          </div>
          <button className="dp-close" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="dp-body">

          {/* ─ Info Table ─ */}
          <section className="dp-section">
            <h3 className="dp-section-title">Facility Information</h3>
            <div className="dp-table-wrap">
              <table className="dp-info-table">
                <tbody>
                  {infoRows.map(row => (
                    <tr key={row.label} className="dp-row">
                      <td className="dp-label">{row.label}</td>
                      <td className={[
                        'dp-value',
                        row.bold  ? 'dp-bold'  : '',
                        row.mono  ? 'dp-mono'  : '',
                        row.small ? 'dp-small' : '',
                        row.color ? `dp-color-${row.color}` : '',
                      ].join(' ')}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ─ QR Code ─ */}
          <section className="dp-section">
            <h3 className="dp-section-title"><QrCode size={14} /> QR Code</h3>
            <div className="dp-qr-card">
              <div className="dp-qr-img-wrap">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt={`QR for ${toilet.name}`} className="dp-qr-img" />
                  : <div className="dp-qr-skeleton">Generating QR…</div>
                }
              </div>
              <div className="dp-qr-meta">
                <b>{toilet.name}</b>
                <span className="dp-mono" style={{ fontSize: '0.8rem' }}>{toilet.code}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', wordBreak: 'break-all', lineHeight: 1.4 }}>{qrUrl}</span>
              </div>
              <div className="dp-qr-actions">
                <button className="primary" onClick={downloadQR} disabled={!qrDataUrl}>
                  <Download size={14} /> Download PNG
                </button>
                <button className="secondary" onClick={printQR} disabled={!qrDataUrl}>
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>
          </section>

          {/* ─ Quick Actions ─ */}
          <section className="dp-section">
            <h3 className="dp-section-title">Quick Actions</h3>
            <div className="dp-action-list">
              <button className="dp-action-row" onClick={() => { onNavigate('cleaning'); onClose(); }}>
                <Clock size={16} color="var(--accent)" />
                <span>View Cleaning History</span>
                <ChevronRight size={14} color="var(--text-tertiary)" />
              </button>
              <button className="dp-action-row" onClick={() => { onNavigate('complaints'); onClose(); }}>
                <AlertTriangle size={16} color="var(--orange)" />
                <span>View Complaints</span>
                <ChevronRight size={14} color="var(--text-tertiary)" />
              </button>
              <button className="dp-action-row" onClick={() => { onNavigate('facilities'); onClose(); }}>
                <Settings size={16} color="var(--text-secondary)" />
                <span>Edit in Facilities</span>
                <ChevronRight size={14} color="var(--text-tertiary)" />
              </button>
            </div>
          </section>

        </div>
      </motion.aside>
    </>
  );
}
