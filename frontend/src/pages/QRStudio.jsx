import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api.js';
import { toiletTypeMeta } from '../lib/data.js';

export default function QRStudio({ toilets, facilityId, notify, onScan, facilityName }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [qrData, setQrData] = useState('');
  const [qrCodes, setQrCodes] = useState([]);
  const [disabling, setDisabling] = useState(false);

  // Load QR codes for this facility
  useEffect(() => {
    if (!facilityId) return;
    api(`/api/admin/qr?facilityId=${facilityId}`)
      .then(r => setQrCodes(r.data || []))
      .catch(() => {});
  }, [facilityId]);

  // Fall back to toilets list if no QR codes yet
  const list = useMemo(() => {
    const base = qrCodes.length ? qrCodes : toilets.map(t => ({
      id: t.id,
      toilet_id: t.id,
      toilet_code: t.code,
      toilet_name: t.name,
      toilet_floor: t.floor,
      toilet_area: t.area,
      toilet_type: t.toilet_type,
      target_url: t.qr_url || `${window.location.origin}/t/${t.code}`,
      status: 'ACTIVE',
    }));
    if (!query) return base;
    return base.filter(q =>
      `${q.toilet_code} ${q.toilet_name} ${q.toilet_floor || ''} ${q.toilet_area || ''}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [qrCodes, toilets, query]);

  const current = list.find(q => q.id === selected) || list[0];
  const typeMeta = toiletTypeMeta[current?.toilet_type] || toiletTypeMeta.Other;
  const qrUrl = current?.target_url || `${window.location.origin}/t/${current?.toilet_code}`;

  // Generate QR code image
  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      width: 520,
      margin: 2,
      color: { dark: '#073f31', light: '#ffffff' },
    }).then(setQrData).catch(() => {});
  }, [qrUrl]);

  // Auto-select first
  useEffect(() => {
    if (list.length && !selected) setSelected(list[0].id);
  }, [list]);

  async function disableQr() {
    if (!current) return;
    setDisabling(true);
    try {
      await api(`/api/admin/qr/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      setQrCodes(qs => qs.map(q => q.id === current.id
        ? { ...q, status: q.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }
        : q
      ));
      notify(current.status === 'ACTIVE' ? 'QR disabled' : 'QR re-enabled');
    } catch {
      notify('Could not update QR status');
    }
    setDisabling(false);
  }

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>ASSETS / QR STUDIO</p>
          <h1>QR Studio</h1>
          <span>Permanent, high-reliability codes for each toilet block.</span>
        </div>
        <div className="page-actions">
          <button className="secondary" onClick={() => window.print()}>Print selected</button>
          <button className="primary" onClick={() => notify(`All ${list.length} QR cards prepared for print`)}>Print all</button>
        </div>
      </div>

      <div className="qr-layout">
        {/* Left: toilet list */}
        <section className="qr-list panel">
          <div className="table-search">
            <span>⌕</span>
            <input placeholder="Search toilet or ID" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {list.map(q => {
            const tm = toiletTypeMeta[q.toilet_type] || toiletTypeMeta.Other;
            return (
              <button key={q.id} className={selected === q.id ? 'selected' : ''} onClick={() => setSelected(q.id)}>
                <span className={`tiny-type ${tm.tone}`}>{tm.icon}</span>
                <div>
                  <b>{q.toilet_name}</b>
                  <small>{q.toilet_code} · {tm.english} · {q.toilet_floor || '—'}</small>
                </div>
                <em>{q.status === 'ACTIVE' ? 'Active' : 'Inactive'}</em>
              </button>
            );
          })}
          {list.length === 0 && (
            <div style={{ padding: 20, color: 'var(--muted)', fontSize: 9, textAlign: 'center' }}>
              No QR codes yet. Set up a facility first.
            </div>
          )}
        </section>

        {/* Center: QR Poster */}
        <section className="poster-wrap">
          {current && (
            <div className={`qr-poster premium simple ${typeMeta.tone}`} id="qr-poster">
              <div className="poster-simple-type">
                <span aria-hidden="true">{typeMeta.icon}</span>
                <div>
                  <b>{typeMeta.english}</b>
                  <em>{typeMeta.marathi}</em>
                </div>
              </div>
              <h2>{current.toilet_name}</h2>
              <p className="poster-facility">{(facilityName || 'BDBA SHATABDI HOSPITAL').toUpperCase()}</p>
              <div className="qr-safe-zone">
                <i className="corner tl" /><i className="corner tr" />
                <i className="corner bl" /><i className="corner br" />
                {qrData && <img src={qrData} alt={`Permanent QR code for ${current.toilet_name}`} />}
              </div>
              <div className="scan-title">
                <h3>SCAN QR · QR स्कॅन करा</h3>
                <p>Open camera and point here · कॅमेरा उघडा आणि येथे स्कॅन करा</p>
              </div>
              <div className="poster-details">
                <span><small>TOILET ID</small><b>{current.toilet_code}</b></span>
                <span><small>LOCATION</small><b>{current.toilet_floor || '—'} · {current.toilet_area || '—'}</b></span>
              </div>
              <div className="poster-mini-actions">
                <span>☺ <b>Feedback</b><small>अभिप्राय</small></span>
                <span>✦ <b>Cleaning staff</b><small>स्वच्छता कर्मचारी</small></span>
              </div>
              <footer>
                <span>PERMANENT CLEANPULSE QR</span>
                <b>{current.toilet_code}</b>
                <em>Do not remove</em>
              </footer>
            </div>
          )}
        </section>

        {/* Right: QR tools */}
        {current && (
          <aside className="qr-tools panel">
            <h2>QR details</h2>
            <label>Permanent URL
              <div className="copy-field">
                <input readOnly value={qrUrl} />
                <button onClick={() => { navigator.clipboard?.writeText(qrUrl); notify('Permanent URL copied'); }}>Copy</button>
              </div>
            </label>
            <div className="qr-facts">
              <span><small>Type</small><b>{typeMeta.icon} {typeMeta.english}</b></span>
              <span><small>Marathi</small><b>{typeMeta.marathi}</b></span>
              <span><small>Status</small><b className={current.status === 'ACTIVE' ? 'green-text' : 'red-text'}>● {current.status === 'ACTIVE' ? 'Active' : 'Inactive'}</b></span>
              <span><small>Error correction</small><b>High (H)</b></span>
              <span><small>Scan count</small><b>{current.scan_count || 0}</b></span>
              <span><small>Destination</small><b>Permanent URL</b></span>
            </div>
            <button className="primary wide-button" onClick={() => {
              if (!qrData) return;
              const a = document.createElement('a');
              a.href = qrData;
              a.download = `${current.toilet_code}-QR.png`;
              a.click();
            }}>↓ Download PNG</button>
            <button className="secondary wide-button" onClick={() => window.print()}>▣ Print premium card</button>
            <button className="secondary wide-button" onClick={() => onScan(current.toilet_code)}>Open QR experience →</button>
            <button className="danger-link" disabled={disabling} onClick={disableQr}>
              {current.status === 'ACTIVE' ? 'Disable QR' : 'Re-enable QR'}
            </button>
          </aside>
        )}
      </div>
    </section>
  );
}
