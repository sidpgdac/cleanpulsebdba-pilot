import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, cleanerApi, publicApi } from '../../lib/api.js';
import { statusMeta, toiletTypeMeta, issueOptions, initials, buildEvidenceCollage, reverseGeocode } from '../../lib/data.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Loader, CheckCircle, Smile, Meh, Frown, Sparkles, Droplets, Trash2, 
  Wind, ArrowRight, Camera, Grid, User, Volume2, ShieldCheck, CameraOff
} from 'lucide-react';

// --- Page Transitions ---
const pageVariants = {
  initial: { opacity: 0, x: 20, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 28 } },
  exit: { opacity: 0, x: -20, scale: 0.98, transition: { duration: 0.2 } }
};

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
  const [gpsData, setGpsData] = useState({ lat: null, lng: null, address: null });

  useEffect(() => {
    if (demo) return;
    publicApi.getToilet(code)
      .then(data => setToilet(data))
      .catch(err => alert(err.message))
      .finally(() => setLoading(false));
  }, [code, demo]);

  useEffect(() => {
    let t;
    if (step === 'cleaning' && session?.started_at) {
      t = setInterval(() => {
        setDuration(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(t);
  }, [step, session]);

  useEffect(() => {
    if (step !== 'cleaning') return;
    if (gpsData.lat) return; 
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const address = await reverseGeocode(lat, lng);
        setGpsData({ lat, lng, address });
      },
      () => {}, 
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [step]);

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
      buildEvidenceCollage(
        siteData, selfieData,
        toilet.code, toilet.name, toilet.floor, toilet.area, selectedCleaner.full_name,
        gpsData.lat, gpsData.lng, gpsData.address
      ).then(setCollageData).catch(console.error);
    }
  }, [siteData, selfieData]);

  if (loading) {
    return (
      <div className="qr-full-screen-loader">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Loader size={32} color="var(--accent)" /></motion.div>
        <b>Loading CleanPulse</b>
      </div>
    );
  }

  if (!toilet) {
    return (
      <div className="qr-backdrop">
        <div className="qr-shell">
          <button className="qr-close-btn" onClick={onClose}><X size={20} /></button>
          <div className="qr-invalid">
            <h1>Invalid QR Code</h1>
            <p><b>{code}</b> is not an active toilet ID.</p>
          </div>
        </div>
      </div>
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
      setCleaners([{ id: 'c1', full_name: 'Amit Patel' }, { id: 'c2', full_name: 'Sunita Sharma' }]);
      return;
    }
    try {
      const { cleaners: list } = await cleanerApi.list(code);
      setCleaners(list || []);
    } catch (e) {
      alert('Could not load cleaners: ' + e.message);
    }
  }

  async function submitPin() {
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
        const result = await cleanerApi.start({
          toiletCode: code,
          cleanerId: selectedCleaner.id,
          pin,
          idempotencyKey: crypto.randomUUID(),
        });
        setSession(result.session);
        setCleanerToken(result.cleaner_token);
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

  async function completeCleaning() {
    if (!collageData) return alert('Photo evidence required.');
    setBusy(true);
    try {
      if (demo) {
        onUpdate({ ...toilet, derived_status: 'CLEAN', last_cleaned_at: new Date().toISOString(), latest_issue: null, attention_minutes: null });
        setStep('complete');
      } else {
        if (!cleanerToken) return alert('Session token expired. Please restart.');
        const fetchResponse = await fetch(collageData);
        const collageBlob = await fetchResponse.blob();
        const collageFile = new File([collageBlob], 'evidence.jpg', { type: 'image/jpeg' });
        const { path: sitePhotoPath } = await cleanerApi.uploadPhoto(collageFile, cleanerToken);

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
    if (val.length <= 4) {
      setPin(val);
      setPinError(false);
    }
  }

  function closeApp() {
    if (demo) onClose();
    else window.location.href = toilet.base_url || 'https://www.mcgm.gov.in/';
  }

  const statusKey = toilet.derived_status || toilet.status || 'CLEAN';
  const isClean = statusKey === 'CLEAN';

  return (
    <div className={`qr-backdrop ${demo ? 'qr-demo-mode' : ''}`}>
      <div className={`qr-shell ${isClean ? 'theme-clean' : 'theme-alert'}`}>
        
        {/* HEADER */}
        <header className="qr-header">
          <div className="qr-brand">
            <span className="qr-logo-icon">CP</span>
            <div className="qr-brand-text">
              <b>CleanPulse</b>
              <small>{toilet.facility_name || 'Facility'}</small>
            </div>
          </div>
          {demo && <button className="qr-close-btn" onClick={onClose}><X size={20} /></button>}
        </header>

        {/* MAIN CONTENT AREA */}
        <main className="qr-main">
          <AnimatePresence mode="wait">

            {/* 1. LANDING SCREEN */}
            {step === 'landing' && (
              <motion.div key="landing" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-hero">
                  <div className={`qr-status-pill ${isClean ? 'clean' : 'alert'}`}>
                    <span className="qr-pulse-dot" /> {sm.label}
                  </div>
                  <h1>{toilet.name}</h1>
                  <p>{[toilet.floor, toilet.area].filter(Boolean).join(' · ')}</p>
                  <div className="qr-meta-row">
                    <span>ID: {code}</span>
                    <span>•</span>
                    <span>{tm.label}</span>
                  </div>
                </div>

                <div className="qr-action-stack">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="qr-action-card citizen" onClick={() => setStep('feedback')}>
                    <div className="qr-action-icon"><Smile size={24} /></div>
                    <div className="qr-action-text">
                      <b>Citizen Feedback</b>
                      <small>Rate cleanliness & report issues</small>
                    </div>
                    <ArrowRight size={18} className="qr-arrow" />
                  </motion.button>

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="qr-action-card cleaner" onClick={loadCleaners}>
                    <div className="qr-action-icon"><ShieldCheck size={24} /></div>
                    <div className="qr-action-text">
                      <b>Staff Login</b>
                      <small>Authorized personnel only</small>
                    </div>
                    <ArrowRight size={18} className="qr-arrow" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* 2. CITIZEN FEEDBACK */}
            {step === 'feedback' && (
              <motion.div key="feedback" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-step-header">
                  <h2>How is the cleanliness?</h2>
                  <p>Your feedback helps us improve.</p>
                </div>
                <div className="qr-rating-grid">
                  <motion.button whileTap={{ scale: 0.95 }} className={`qr-rating-btn ${rating === 'good' ? 'active-good' : ''}`} onClick={() => { setRating('good'); setStep('thanks'); }}>
                    <Smile size={32} />
                    <b>Clean</b>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} className={`qr-rating-btn ${rating === 'bad' ? 'active-warn' : ''}`} onClick={() => { setRating('bad'); setStep('issue'); }}>
                    <Meh size={32} />
                    <b>Needs Work</b>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} className={`qr-rating-btn ${rating === 'urgent' ? 'active-urgent' : ''}`} onClick={() => { setRating('urgent'); setStep('issue'); }}>
                    <Frown size={32} />
                    <b>Urgent</b>
                  </motion.button>
                </div>
                <button className="qr-nav-back" onClick={() => setStep('landing')}>← Back</button>
              </motion.div>
            )}

            {/* 3. ISSUE SELECT */}
            {step === 'issue' && (
              <motion.div key="issue" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-step-header">
                  <h2>What's the issue?</h2>
                  <p>Select the main problem to report.</p>
                </div>
                <div className="qr-issue-grid">
                  {issueOptions.map(opt => (
                    <button key={opt[1]} className={`qr-issue-btn ${issue === opt[1] ? 'selected' : ''}`} onClick={() => setIssue(opt[1])}>
                      <b>{opt[1]}</b>
                      <small>{opt[2]}</small>
                    </button>
                  ))}
                </div>
                <div className="qr-bottom-actions">
                  <button className="qr-nav-back" onClick={() => setStep('feedback')}>← Back</button>
                  <button className="qr-btn-primary" disabled={!issue} onClick={() => setStep('location')}>Next →</button>
                </div>
              </motion.div>
            )}

            {/* 4. LOCATION */}
            {step === 'location' && (
              <motion.div key="location" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-step-header">
                  <h2>Where exactly?</h2>
                </div>
                <div className="qr-list-menu">
                  <button className={`qr-list-item ${unit === 'whole' ? 'selected' : ''}`} onClick={() => setUnit('whole')}>
                    <Grid size={18} /> <span>General area / Whole block</span>
                  </button>
                  {Array.from({ length: toilet.total_units || 4 }).map((_, i) => (
                    <button key={i} className={`qr-list-item ${unit === `U${i+1}` ? 'selected' : ''}`} onClick={() => setUnit(`U${i+1}`)}>
                      <b>{i + 1}</b> <span>Cubicle {i + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="qr-bottom-actions">
                  <button className="qr-nav-back" onClick={() => setStep('issue')}>← Back</button>
                  <button className="qr-btn-primary" disabled={busy} onClick={submitFeedback}>
                    {busy ? <Loader className="spin" size={16} /> : 'Submit Report'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 5. THANK YOU */}
            {step === 'thanks' && (
              <motion.div key="thanks" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen centered">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }} className="qr-success-icon">
                  <CheckCircle size={48} />
                </motion.div>
                <h1>Thank You</h1>
                <p>Your report has been logged and assigned to the facility management team.</p>
                <div className="qr-receipt">
                  <small>TICKET ID</small>
                  <b>CP-{Math.random().toString(36).slice(2, 8).toUpperCase()}</b>
                </div>
                <button className="qr-btn-primary" onClick={closeApp}>Done</button>
              </motion.div>
            )}

            {/* 6. CLEANER SELECT */}
            {step === 'cleaner' && (
              <motion.div key="cleaner" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-step-header">
                  <h2>Staff Login</h2>
                  <p>Select your profile to begin.</p>
                </div>
                <div className="qr-cleaner-list">
                  {cleaners.length === 0 ? (
                    <div className="qr-empty">No cleaners assigned.</div>
                  ) : cleaners.map(c => (
                    <button key={c.id} className="qr-cleaner-row" onClick={() => { setSelectedCleaner(c); setStep('pin'); }}>
                      <div className="qr-avatar">{initials(c.full_name)}</div>
                      <span>{c.full_name}</span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                <button className="qr-nav-back" onClick={() => setStep('landing')}>← Back</button>
              </motion.div>
            )}

            {/* 7. PIN ENTRY */}
            {step === 'pin' && (
              <motion.div key="pin" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen centered">
                <div className="qr-avatar lg">{initials(selectedCleaner?.full_name)}</div>
                <h2>{selectedCleaner?.full_name}</h2>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Enter your 4-digit PIN</p>

                <div className="qr-pin-display">
                  {[0, 1, 2, 3].map(i => (
                    <motion.div key={i} className={`qr-pin-dot ${pin.length > i ? 'filled' : ''}`} animate={{ scale: pin.length === i + 1 ? [1, 1.2, 1] : 1 }} />
                  ))}
                </div>

                {pinError && <p className="qr-error-text">Incorrect PIN. Try again.</p>}

                <div className="qr-keypad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button key={n} onClick={() => handlePinInput(pin + n)}>{n}</button>
                  ))}
                  <button className="action" onClick={() => setStep('cleaner')}>Back</button>
                  <button onClick={() => handlePinInput(pin + '0')}>0</button>
                  <button className="action" onClick={() => handlePinInput(pin.slice(0, -1))}>Del</button>
                </div>

                <div className="qr-submit-area">
                  <button className="qr-btn-primary full" disabled={pin.length !== 4 || busy} onClick={submitPin}>
                    {busy ? <Loader className="spin" size={18} /> : 'Submit PIN'}
                  </button>
                </div>
                {demo && <p className="qr-demo-hint">Demo PIN: <b>1234</b></p>}
              </motion.div>
            )}

            {/* 8. READY TO CLEAN */}
            {step === 'ready' && (
              <motion.div key="ready" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen centered">
                <div className="qr-ready-icon"><Sparkles size={40} /></div>
                <h1>Ready to Clean</h1>
                <div className="qr-assignment-card">
                  <small>ASSIGNED AREA</small>
                  <b>{toilet.name}</b>
                  <span>{toilet.floor}</span>
                </div>
                <button className="qr-btn-primary full massive" disabled={busy} onClick={startCleaning}>
                  {busy ? <Loader className="spin" size={20} /> : 'START CLEANING'}
                </button>
              </motion.div>
            )}

            {/* 9. CLEANING IN PROGRESS */}
            {step === 'cleaning' && (
              <motion.div key="cleaning" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen">
                <div className="qr-timer-header">
                  <div className="qr-pulse-indicator" />
                  <div className="qr-timer">
                    {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toString().padStart(2, '0')}
                  </div>
                  <small>MINUTES ELAPSED</small>
                </div>

                {collageData ? (
                  <div className="qr-evidence-preview">
                    <img src={collageData} alt="Evidence" />
                    <div className="qr-evidence-actions">
                      <button className="qr-btn-secondary" onClick={() => setCollageData(null)}>Retake</button>
                      <button className="qr-btn-primary" disabled={busy} onClick={completeCleaning}>
                        {busy ? <Loader className="spin" size={16} /> : 'Upload & Complete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="qr-camera-flow">
                    <div className="qr-camera-tabs">
                      <div className={`qr-tab ${photoView === 'site' ? 'active' : ''} ${siteData ? 'done' : ''}`}>1. Site</div>
                      <div className={`qr-tab ${photoView === 'selfie' ? 'active' : ''} ${selfieData ? 'done' : ''}`}>2. Selfie</div>
                    </div>

                    <div className="qr-camera-viewport">
                      {photoView === 'site' && (
                        <label className={`qr-camera-trigger ${siteData ? 'has-img' : ''}`}>
                          {siteData ? <img src={siteData} alt="Site" /> : <><CameraOff size={32} /> <span>Tap to photograph clean floor & cubicles</span></>}
                          <input type="file" accept="image/*" capture="environment" onChange={e => { setSitePhoto(e.target.files[0]); setPhotoView('selfie'); }} />
                        </label>
                      )}
                      {photoView === 'selfie' && (
                        <label className={`qr-camera-trigger ${selfieData ? 'has-img' : ''}`}>
                          {selfieData ? <img src={selfieData} alt="Selfie" /> : <><User size={32} /> <span>Tap to take uniform selfie</span></>}
                          <input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files[0])} />
                        </label>
                      )}
                    </div>
                    {photoView === 'selfie' && siteData && !selfieData && (
                       <button className="qr-nav-back" style={{ alignSelf: 'center', marginTop: 10 }} onClick={() => setPhotoView('site')}>← Back to Site Photo</button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* 10. DUTY COMPLETE */}
            {step === 'complete' && (
              <motion.div key="complete" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="qr-screen centered">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }} className="qr-success-icon">
                  <CheckCircle size={48} />
                </motion.div>
                <h1>Duty Complete</h1>
                <p>Excellent work. Your cycle has been verified.</p>
                {collageData && <img src={collageData} className="qr-final-evidence" alt="Evidence" />}
                <button className="qr-btn-primary full" onClick={closeApp}>Close App</button>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}


