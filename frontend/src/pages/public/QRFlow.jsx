import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, cleanerApi, publicApi } from '../../lib/api.js';
import { statusMeta, toiletTypeMeta, issueOptions, initials, buildEvidenceCollage } from '../../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Loader, CheckCircle, Smile, Meh, Frown, Sparkles, Droplets, Trash2, 
  Wind, ArrowRight, Camera, Grid, User, Volume2
} from 'lucide-react';

export default function QRFlow({ toilet: demoToilet, onClose, onUpdate, notify, demo }) {
  const { code: routeCode } = useParams();
  const code = demo ? demoToilet.code : (routeCode || '').toUpperCase();

  const [toilet, setToilet] = useState(demoToilet || null);
  const [step, setStep] = useState('landing');
  const [loading, setLoading] = useState(!demoToilet);
  
  // Citizen state
  const [rating, setRating] = useState(null);
  const [issue, setIssue] = useState('');
  const [unit, setUnit] = useState('whole');
  
  // Cleaner state
  const [cleaners, setCleaners] = useState([]);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [cleanerToken, setCleanerToken] = useState('');
  const [session, setSession] = useState(null);
  
  // Cleaning evidence state
  const [sitePhoto, setSitePhoto] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [siteData, setSiteData] = useState(null);
  const [selfieData, setSelfieData] = useState(null);
  const [collageData, setCollageData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [photoView, setPhotoView] = useState('site');
  const [marathiAudio, setMarathiAudio] = useState(null);

  useEffect(() => {
    if (demo) return;
    
    // Load toilet info from backend (backend also increments scan count)
    publicApi.getToilet(code)
      .then(data => setToilet(data))
      .catch(err => alert(err.message))
      .finally(() => setLoading(false));
  }, [code, demo]);

  // Timer
  useEffect(() => {
    let t;
    if (step === 'cleaning' && session?.started_at) {
      t = setInterval(() => {
        setDuration(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(t);
  }, [step, session]);

  const loadFile = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setter(e.target.result);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (sitePhoto) loadFile(sitePhoto, setSiteData);
    if (selfie) loadFile(selfie, setSelfieData);
  }, [sitePhoto, selfie]);

  useEffect(() => {
    if (siteData && selfieData && toilet && selectedCleaner) {
      buildEvidenceCollage(siteData, selfieData, toilet.code, toilet.name, toilet.floor, toilet.area, selectedCleaner.full_name)
        .then(setCollageData).catch(console.error);
    }
  }, [siteData, selfieData]);

  if (loading) {
    return (
      <div className="loadingScreen">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="logo"><Loader size={24} /></motion.div>
        <b style={{fontSize:11,color:'var(--text-muted)'}}>LOADING</b>
      </div>
    );
  }

  if (!toilet) {
    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="experience-backdrop"
        >
          <div className="mobile-shell">
            <button className="ghost" onClick={onClose}><X size={24} /></button>
            <h1>Invalid CleanPulse QR</h1>
            <p><b>{code}</b> is not an active toilet ID.</p>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const status = toilet.derived_status === 'MAINTENANCE' ? 'maintenance'
    : ['NEEDS_CLEANING','NOT_CLEANED','OVERDUE'].includes(toilet.derived_status) ? 'alert'
    : toilet.derived_status === 'CLEANING' ? 'due'
    : 'clean';
  const sm = statusMeta[status];
  const tm = toiletTypeMeta[toilet.toilet_type] || toiletTypeMeta.Other;

  async function submitFeedback() {
    setBusy(true);
    try {
      if (demo) {
        onUpdate({ ...toilet, derived_status: 'NEEDS_CLEANING', open_complaints: (toilet.open_complaints||0) + 1, latest_issue: issue });
      } else {
        // Use backend API for rate-limited, validated feedback submission
        await publicApi.submitFeedback({ toiletCode: code, category: issue });
      }
      setStep('thanks');
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadCleaners() {
    setStep('cleaner');
    if (demo) {
      setCleaners([{ id: 'c1', full_name: 'Amit Patel' }]);
      return;
    }
    try {
      // Use backend API — backend fetches from service role, not anon
      const { cleaners: list } = await cleanerApi.list(code);
      setCleaners(list || []);
    } catch (e) {
      alert('Could not load cleaners: ' + e.message);
    }
  }

  // PIN entry — we just advance to the ready screen; actual PIN verification
  // happens server-side when startCleaning() is called (prevents double bcrypt).
  async function verifyPin() {
    if (pin.length !== 4) return;
    setBusy(true);
    setPinError(false);
    try {
      if (demo) {
        if (pin === '1234') {
          setSession({ started_at: new Date().toISOString() });
          setStep('ready');
        } else {
          setPinError(true);
          setPin('');
        }
      } else {
        // Move to ready screen — PIN is verified when startCleaning is called
        setStep('ready');
      }
    } catch (e) {
      setPinError(true);
      setPin('');
    } finally {
      setBusy(false);
    }
  }


  async function startCleaning() {
    setBusy(true);
    try {
      if (demo) {
        setSession({ started_at: new Date().toISOString() });
        setStep('cleaning');
      } else {
        // Backend verifies PIN with bcrypt + rate limiting + lockout protection
        const result = await cleanerApi.start({
          toiletCode: code,
          cleanerId: selectedCleaner.id,
          pin,
          idempotencyKey: crypto.randomUUID(),
        });
        setSession(result.session);
        setCleanerToken(result.cleaner_token); // Store JWT for complete step
        setStep('cleaning');
      }
    } catch (e) {
      if (e.message.toLowerCase().includes('incorrect pin') || e.message.toLowerCase().includes('401')) {
        setPinError(true);
        setPin('');
        setStep('pin');
      }
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function playMarathiReminder() {
    if (marathiAudio) { marathiAudio.play(); return; }
    try {
      if (demo) {
        if (notify) notify('Marathi instructions playing');
        return;
      }
      // Backend serves the audio file — properly cached and no 404 anymore
      const audioUrl = publicApi.audioUrl();
      const a = new Audio(audioUrl);
      setMarathiAudio(a);
      a.play();
    } catch (e) {
      alert('Audio instructions not available.');
    }
  }

  async function uploadFile(file, kind) {
    if (demo) return 'demo-path';
    const ext = file.type?.includes('png') ? 'png' : 'jpg';
    const path = `${session.facility_id}/${session.toilet_id}/${session.id}/site-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('cleaning-evidence').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    return path;
  }

  async function completeCleaning() {
    if (!collageData) return alert('Photo evidence required.');
    setBusy(true);
    try {
      if (demo) {
        onUpdate({ ...toilet, derived_status: 'CLEAN', last_cleaned_at: new Date().toISOString(), latest_issue: null, attention_minutes: null });
        setStep('complete');
      } else {
        if (!cleanerToken) {
          return alert('Session token expired. Please restart the cleaning process.');
        }

        // Convert base64 collage to a File for upload
        const fetchResponse = await fetch(collageData);
        const collageBlob = await fetchResponse.blob();
        const collageFile = new File([collageBlob], 'evidence.jpg', { type: 'image/jpeg' });

        // Upload via backend (MIME validated, service-role upload — no storage credentials in browser)
        const { path: sitePhotoPath } = await cleanerApi.uploadPhoto(collageFile, cleanerToken);

        // GPS (optional, best effort)
        let gps = null;
        try {
          gps = await new Promise(res => {
            navigator.geolocation.getCurrentPosition(
              pos => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
              () => res(null),
              { enableHighAccuracy: true, timeout: 5000 }
            );
          });
        } catch {}

        // Complete via backend using the short-lived cleaner JWT (no PIN re-entry)
        await cleanerApi.complete({
          cleanerToken,
          sitePhotoPath,
          selfiePath: '',
          lat: gps?.lat || null,
          lng: gps?.lng || null,
          accuracy: gps?.accuracy || null,
        });

        setStep('complete');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handlePinInput(val) {
    const v = val.replace(/\D/g, '').slice(0, 4);
    setPin(v);
    setPinError(false);
  }

  function closeApp() {
    if (demo) onClose();
    else window.location.href = toilet.base_url || 'https://www.mcgm.gov.in/';
  }

  const statusKey = toilet.derived_status || toilet.status || 'CLEAN';
  const statusClass = (statusKey === 'CLEAN') ? 'green' : (statusKey === 'NEEDS_CLEANING' || statusKey === 'CLEANING') ? 'orange' : 'red';

  return (
    <div className={demo ? 'experience-backdrop' : ''}>
      <div className={demo ? 'phone-stage' : ''}>
        <div className={demo ? 'phone-frame' : 'qrPage'}>
          {/* ─── HEADER ─── */}
          <header className="mobile-header">
            <div>
              <b>CleanPulse</b>
              <small>BDBA Hospital · {toilet.facility_name || 'Facility'}</small>
            </div>
            {demo && <button className="ghost" onClick={onClose} style={{ padding: '0.4rem' }}><X size={18} /></button>}
          </header>

          <main className="mobile-page">
            <AnimatePresence mode="wait">

              {/* ─── LANDING ─── */}
              {step === 'landing' && (
                <motion.div
                  key="landing"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="mobile-view"
                  style={{ gap: 0 }}
                >
                  <div className="qr-hero">
                    <div className={`status-badge ${statusClass}`}>
                      <span className="dot" />
                      {sm.label}
                    </div>
                    <h1>{toilet.name}</h1>
                    <p>{[toilet.floor, toilet.area].filter(Boolean).join(' · ')}</p>
                    <small>ID: {code} · {tm.label}</small>
                  </div>

                  <div className="step-stack" style={{ marginTop: '1.5rem', flex: 1 }}>
                    <div className="action-grid">
                      <button className="action-btn" onClick={() => setStep('feedback')}>
                        <div className="icon-wrap accent"><Smile size={20} /></div>
                        <div className="text-group">
                          <b>Submit Feedback</b>
                          <small>Rate cleanliness & report issues</small>
                        </div>
                        <ArrowRight size={16} className="arrow" />
                      </button>
                      <button className="action-btn" onClick={loadCleaners}>
                        <div className="icon-wrap light"><Sparkles size={20} /></div>
                        <div className="text-group">
                          <b>Staff Login</b>
                          <small>Log your cleaning cycle</small>
                        </div>
                        <ArrowRight size={16} className="arrow" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── FEEDBACK / RATING ─── */}
              {step === 'feedback' && (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="step-stack"
                >
                  <div className="step-title">
                    <h2>How is the cleanliness?</h2>
                    <p>Your anonymous feedback is reviewed daily.</p>
                  </div>
                  <div className="rating-options">
                    <button className={`rating-btn ${rating === 'good' ? 'selected good' : ''}`} onClick={() => { setRating('good'); setStep('thanks'); }}>
                      <div className="icon"><Smile size={24} color={rating === 'good' ? 'var(--green)' : 'var(--text-tertiary)'} /></div>
                      <div className="info">
                        <b>Clean &amp; functioning</b>
                        <small>Everything is in order</small>
                      </div>
                    </button>
                    <button className={`rating-btn ${rating === 'bad' ? 'selected medium' : ''}`} onClick={() => { setRating('bad'); setStep('issue'); }}>
                      <div className="icon"><Meh size={24} color={rating === 'bad' ? 'var(--orange)' : 'var(--text-tertiary)'} /></div>
                      <div className="info">
                        <b>Needs attention</b>
                        <small>Wet floor, no soap, or dirty</small>
                      </div>
                    </button>
                    <button className={`rating-btn ${rating === 'urgent' ? 'selected bad' : ''}`} onClick={() => { setRating('urgent'); setStep('issue'); }}>
                      <div className="icon"><Frown size={24} color={rating === 'urgent' ? 'var(--red)' : 'var(--text-tertiary)'} /></div>
                      <div className="info">
                        <b>Urgent problem</b>
                        <small>Blocked, broken, or unusable</small>
                      </div>
                    </button>
                  </div>
                  <button className="link-btn" onClick={() => setStep('landing')}>← Back</button>
                </motion.div>
              )}

              {/* ─── ISSUE SELECT ─── */}
              {step === 'issue' && (
                <motion.div
                  key="issue"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="step-stack"
                >
                  <div className="step-title">
                    <h2>What is the issue?</h2>
                    <p>Select the main problem to report.</p>
                  </div>
                  <div className="issue-grid">
                    {issueOptions.map(opt => (
                      <button key={opt[1]} className={`issue-btn ${issue === opt[1] ? 'selected' : ''}`} onClick={() => setIssue(opt[1])}>
                        <b>{opt[1]}</b>
                        <small>{opt[2]}</small>
                      </button>
                    ))}
                  </div>
                  <button className="mobile-primary" disabled={!issue} onClick={() => setStep('location')}>
                    Next →
                  </button>
                  <button className="link-btn" onClick={() => setStep('feedback')}>← Back</button>
                </motion.div>
              )}

              {/* ─── LOCATION ─── */}
              {step === 'location' && (
                <motion.div
                  key="location"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="step-stack"
                >
                  <div className="step-title">
                    <h2>Where exactly?</h2>
                    <p>Help staff locate the problem quickly.</p>
                  </div>
                  <div className="location-options">
                    <button className={`location-btn ${unit === 'whole' ? 'selected' : ''}`} onClick={() => setUnit('whole')}>
                      <div className="unit-num"><Grid size={16} /></div>
                      <div className="unit-info"><b>Whole block</b><small>General area issue</small></div>
                    </button>
                    {Array.from({ length: toilet.total_units || 4 }).map((_, i) => (
                      <button key={i} className={`location-btn ${unit === `U${i+1}` ? 'selected' : ''}`} onClick={() => setUnit(`U${i+1}`)}>
                        <div className="unit-num">{i + 1}</div>
                        <div className="unit-info"><b>Cubicle {i + 1}</b><small>Internal unit</small></div>
                      </button>
                    ))}
                  </div>
                  <label className="optional-photo-label">
                    <Camera size={20} color="var(--text-tertiary)" />
                    <div>
                      <b>Add photo</b>
                      <small>Optional · helps teams fix faster</small>
                    </div>
                    <input type="file" accept="image/*" />
                  </label>
                  <button className="mobile-primary" disabled={busy} onClick={submitFeedback}>
                    {busy ? 'Submitting…' : 'Submit Report'}
                  </button>
                  <button className="link-btn" onClick={() => setStep('issue')}>← Back</button>
                </motion.div>
              )}

              {/* ─── THANK YOU ─── */}
              {step === 'thanks' && (
                <motion.div
                  key="thanks"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="success-page"
                >
                  <motion.div className="success-icon-wrap" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}>
                    <CheckCircle size={40} color="var(--green)" />
                  </motion.div>
                  <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>Thank You</motion.h1>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    Your report is logged and assigned to the facility management team.
                  </motion.p>
                  <motion.div className="ticket-receipt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <small>TICKET ID</small>
                    <b>CP-{Math.random().toString(36).slice(2, 8).toUpperCase()}</b>
                    <div className="live-dot">Active and routed</div>
                  </motion.div>
                  <div className="info-grid">
                    <div className="info-cell"><small>Location</small><b>{toilet.name}</b></div>
                    <div className="info-cell"><small>Issue</small><b>{issue || 'No issues'}</b></div>
                  </div>
                  <button className="mobile-primary" onClick={closeApp}>Done</button>
                </motion.div>
              )}

              {/* ─── CLEANER SELECT ─── */}
              {step === 'cleaner' && (
                <motion.div
                  key="cleaner"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="step-stack"
                >
                  <div className="step-title">
                    <h2>Who is cleaning?</h2>
                    <p>Select your name to start duty.</p>
                  </div>
                  <div className="cleaner-list">
                    {cleaners.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>
                        No cleaners assigned to this facility.
                      </div>
                    ) : cleaners.map((c, i) => (
                      <motion.button
                        key={c.id}
                        className="cleaner-btn"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => { setSelectedCleaner(c); setStep('pin'); }}
                      >
                        <div className="cleaner-avatar">{initials(c.full_name)}</div>
                        <div className="info">
                          <b>{c.full_name}</b>
                          <small>Cleaning Staff</small>
                        </div>
                        <ArrowRight size={16} color="var(--text-tertiary)" />
                      </motion.button>
                    ))}
                  </div>
                  <button className="link-btn" onClick={() => setStep('landing')}>← Back</button>
                </motion.div>
              )}

              {/* ─── PIN ENTRY ─── */}
              {step === 'pin' && (
                <motion.div
                  key="pin"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="pin-screen"
                >
                  <div className="pin-avatar">{initials(selectedCleaner?.full_name)}</div>
                  <h2>{selectedCleaner?.full_name}</h2>
                  <p>Enter your 4-digit PIN to continue</p>

                  <AnimatePresence>
                    {pinError && (
                      <motion.div
                        className="pin-error"
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        Incorrect PIN — please try again
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pin-dots">
                    {[0, 1, 2, 3].map(i => (
                      <motion.div
                        key={i}
                        className={`pin-dot ${pin.length > i ? 'filled' : ''}`}
                        animate={{ scale: pin.length === i + 1 ? [1, 1.3, 1] : 1 }}
                        transition={{ duration: 0.15 }}
                      />
                    ))}
                  </div>

                  <div className="pin-keypad">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <button key={n} className="pin-key" disabled={busy} onClick={() => handlePinInput(pin + n)}>{n}</button>
                    ))}
                    <button className="pin-key action" disabled={busy} onClick={() => setStep('cleaner')}>Back</button>
                    <button className="pin-key" disabled={busy} onClick={() => handlePinInput(pin + '0')}>0</button>
                    <button className="pin-key action" disabled={busy} onClick={() => handlePinInput(pin.slice(0, -1))}>Del</button>
                  </div>

                  <div className="pin-submit-area">
                    <button
                      className="mobile-primary"
                      disabled={pin.length !== 4 || busy}
                      onClick={verifyPin}
                    >
                      {busy ? <><Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Verifying…</> : 'Submit PIN →'}
                    </button>
                  </div>

                  {demo && (
                    <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                      Demo PIN: <b style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>1234</b>
                    </p>
                  )}
                </motion.div>
              )}

              {/* ─── READY TO CLEAN ─── */}
              {step === 'ready' && (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  className="step-stack"
                >
                  <div className="cleaning-hero">
                    <motion.div className="cleaning-icon-wrap" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 15 }}>
                      <Sparkles size={36} color="var(--green)" />
                    </motion.div>
                    <h1>Ready to Clean</h1>
                    <p>Assigned to block below</p>
                  </div>

                  <div className="location-card">
                    <div className="loc-icon">{tm.icon || '🚻'}</div>
                    <div>
                      <b>{toilet.name}</b>
                      <small>{toilet.code} · {toilet.floor}</small>
                    </div>
                  </div>

                  {toilet.latest_issue && (
                    <div className="issue-alert">
                      <AlertTriangle size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <b>Citizen report: {toilet.latest_issue}</b>
                        <small>Please ensure this issue is resolved</small>
                      </div>
                    </div>
                  )}

                  <div className="assignment-grid">
                    <div className="info-cell">
                      <small>Assigned to</small>
                      <b>{selectedCleaner?.full_name}</b>
                    </div>
                    <div className="info-cell">
                      <small>Target time</small>
                      <b>15 minutes</b>
                    </div>
                  </div>

                  <button className="mobile-primary" disabled={busy} onClick={startCleaning}>
                    {busy ? 'Starting…' : 'START CLEANING →'}
                  </button>
                </motion.div>
              )}

              {/* ─── CLEANING IN PROGRESS ─── */}
              {step === 'cleaning' && (
                <motion.div
                  key="cleaning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="step-stack"
                >
                  <div style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Cleaning in Progress</p>
                    <div className="cleaning-timer">
                      {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="timer-label">minutes elapsed</p>
                  </div>

                  <div className="reminder-grid">
                    <div className="reminder-item">
                      <Sparkles size={20} color="var(--accent)" />
                      <small>Floor mopped</small>
                    </div>
                    <div className="reminder-item">
                      <Droplets size={20} color="var(--accent)" />
                      <small>Basin wiped</small>
                    </div>
                    <div className="reminder-item">
                      <Trash2 size={20} color="var(--accent)" />
                      <small>Bins emptied</small>
                    </div>
                    <div className="reminder-item">
                      <Wind size={20} color="var(--accent)" />
                      <small>Smell cleared</small>
                    </div>
                  </div>

                  <button className="audio-btn" onClick={playMarathiReminder}>
                    <Volume2 size={15} /> Play instructions in Marathi
                  </button>

                  <div className="privacy-notice">
                    Photo evidence required · Include yourself and the clean facility
                  </div>

                  {collageData ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="step-stack">
                      <div className="collage-preview">
                        <img src={collageData} alt="Evidence collage" />
                        <div className="evidence-badge"><CheckCircle size={12} /> Evidence ready</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.65rem' }}>
                        <button className="mobile-secondary" style={{ flex: 1 }} onClick={() => setCollageData(null)}>Retake</button>
                        <button className="mobile-primary" style={{ flex: 2 }} disabled={busy} onClick={completeCleaning}>
                          {busy ? 'Uploading…' : <><CheckCircle size={14} /> Complete Cycle</>}
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="step-stack">
                      <div style={{ display: 'flex', gap: '0.65rem' }}>
                        <button
                          className={photoView === 'site' ? 'mobile-primary' : 'mobile-secondary'}
                          style={{ flex: 1, fontSize: '0.8rem' }}
                          onClick={() => setPhotoView('site')}
                        >
                          1. Clean site {siteData ? '✓' : ''}
                        </button>
                        <button
                          className={photoView === 'selfie' ? 'mobile-primary' : 'mobile-secondary'}
                          style={{ flex: 1, fontSize: '0.8rem', opacity: siteData ? 1 : 0.45 }}
                          onClick={() => siteData && setPhotoView('selfie')}
                        >
                          2. Selfie {selfieData ? '✓' : ''}
                        </button>
                      </div>

                      {photoView === 'site' && (
                        <label className={`camera-box ${siteData ? 'has-photo' : ''}`}>
                          {siteData
                            ? <img src={siteData} alt="Site" />
                            : <><Camera size={28} color="var(--text-tertiary)" /><b>Photo of clean facility</b><small>Ensure floor and cubicles are visible</small></>
                          }
                          <input type="file" accept="image/*" capture="environment" onChange={e => setSitePhoto(e.target.files[0])} />
                        </label>
                      )}

                      {photoView === 'selfie' && (
                        <label className={`camera-box ${selfieData ? 'has-photo' : ''}`}>
                          {selfieData
                            ? <img src={selfieData} alt="Selfie" />
                            : <><User size={28} color="var(--text-tertiary)" /><b>Selfie in uniform</b><small>Must match your registered face</small></>
                          }
                          <input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files[0])} />
                        </label>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── DUTY COMPLETE ─── */}
              {step === 'complete' && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="success-page"
                >
                  <motion.div className="success-icon-wrap" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}>
                    <CheckCircle size={40} color="var(--green)" />
                  </motion.div>
                  <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>Duty Complete</motion.h1>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    Excellent work! Your cleaning cycle has been recorded.
                  </motion.p>
                  {collageData && <img src={collageData} className="completion-collage" alt="Evidence" />}
                  <div className="info-grid">
                    <div className="info-cell"><small>Cleaner</small><b>{selectedCleaner?.full_name}</b></div>
                    <div className="info-cell"><small>Duration</small><b>{Math.max(1, Math.round(duration / 60))} min</b></div>
                    <div className="info-cell" style={{ gridColumn: '1/-1' }}><small>Facility</small><b>{toilet.name}</b></div>
                  </div>
                  <button className="mobile-primary" onClick={closeApp}>Close Shift</button>
                </motion.div>
              )}

            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}

