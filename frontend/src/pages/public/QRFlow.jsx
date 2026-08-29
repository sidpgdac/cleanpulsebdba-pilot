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

  return (
    <div className={demo ? 'experience-backdrop' : ''}>
      <div className={demo ? 'phone-stage' : ''}>
        {demo && <p className="demo-caption">CITIZEN & CLEANER JOURNEY</p>}
        
        <div className={demo ? 'phone-frame' : 'qrPage'} style={demo ? {} : { padding: 0 }}>
          <header className="mobile-header">
            <div>
              <b>CleanPulse</b>
              <small>BDBA Hospital</small>
            </div>
            {demo && <button className="ghost" onClick={onClose}><X size={20} /></button>}
          </header>

          <main className="mobile-page">
            {step === 'landing' && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mobile-view">
                <div className="qr-hero">
                  <div className="qr-hero-card">
                    <b style={{ color: sm.color, background: `${sm.dot}10` }}>{sm.label}</b>
                    <h1>{toilet.name}</h1>
                    <p>{[toilet.floor, toilet.area].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>

                <div className="mobile-body">
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Help us maintain this facility</p>
                  
                  <div className="action-grid">
                    <button className="action-btn" onClick={() => setStep('feedback')}>
                      <Smile size={24} color="var(--accent)" />
                      <div><b>Submit Feedback</b><small>Rate cleanliness</small></div>
                      <ArrowRight size={16} color="var(--text-muted)" />
                    </button>
                    
                    <button className="action-btn outline" onClick={loadCleaners}>
                      <Sparkles size={24} color="var(--ink)" />
                      <div><b>Staff Login</b><small>Log cleaning cycle</small></div>
                      <ArrowRight size={16} color="var(--text-muted)" />
                    </button>
                  </div>

                  <div className="qr-footer">
                    <small>ID: {code} · {tm.label}</small>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'feedback' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mobile-view feedback-flow">
                <div className="mobile-body">
                  <h2>How is the cleanliness?</h2>
                  <div className="rating-options">
                    <button className={rating === 'good' ? 'selected' : ''} onClick={() => setRating('good')}>
                      <Smile size={32} color={rating === 'good' ? 'var(--green)' : 'var(--text-muted)'} />
                      <div><b>Clean & functioning</b><small>Everything is good</small></div>
                    </button>
                    <button className={rating === 'bad' ? 'selected' : ''} onClick={() => setRating('bad')}>
                      <Meh size={32} color={rating === 'bad' ? 'var(--orange)' : 'var(--text-muted)'} />
                      <div><b>Needs attention</b><small>Wet floor, no soap, or dirty</small></div>
                    </button>
                    <button className={rating === 'urgent' ? 'selected' : ''} onClick={() => setRating('urgent')}>
                      <Frown size={32} color={rating === 'urgent' ? 'var(--red)' : 'var(--text-muted)'} />
                      <div><b>Urgent problem</b><small>Blocked, broken, or unusable</small></div>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'issue' && (
              <>
                <div className="mobile-heading">
                  <h1>What is wrong?</h1>
                  <p>Select the main issue.</p>
                </div>
                <div className="issue-grid">
                  {issueOptions.map(opt => (
                    <button key={opt[1]} className={issue === opt[1] ? 'selected' : ''} onClick={() => setIssue(opt[1])}>
                      <span>{opt[0]}</span>
                      <b>{opt[1]}</b>
                      <small>{opt[2]}</small>
                    </button>
                  ))}
                </div>
                <button className="mobile-primary" disabled={!issue} onClick={() => setStep('location')}>Next →</button>
              </>
            )}

            {step === 'location' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mobile-view feedback-flow">
                <div className="mobile-heading">
                  <h1>Where exactly?</h1>
                  <p>Help staff find the problem.</p>
                </div>
                <div className="location-options">
                  <button className={unit === 'whole' ? 'selected' : ''} onClick={() => setUnit('whole')}>
                    <Grid size={24} color={unit === 'whole' ? 'var(--accent)' : 'var(--text-muted)'} />
                    <div><b>Whole block</b><small>General issue</small></div>
                  </button>
                  {Array.from({ length: toilet.total_units || 4 }).map((_, i) => (
                    <button key={i} className={unit === `U${i+1}` ? 'selected' : ''} onClick={() => setUnit(`U${i+1}`)}>
                      <span className="unit-number">{i+1}</span>
                      <div><b>Cubicle {i+1}</b><small>Internal unit</small></div>
                    </button>
                  ))}
                </div>
                <label className="optional-photo">
                  <Camera size={24} color="var(--text-muted)" />
                  <div><b>Add photo (optional)</b><small>Helps teams fix faster</small></div>
                  <input type="file" accept="image/*" />
                </label>
                <button className="mobile-primary" disabled={busy} onClick={submitFeedback}>
                  {busy ? 'Submitting...' : 'Submit report'}
                </button>
              </motion.div>
            )}

            {step === 'thanks' && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="success-page">
                <div className="success-check"><CheckCircle size={48} color="var(--green)" /></div>
                <h1>Thank You</h1>
                <p>Your report has been logged and assigned to the facility management team.</p>
                
                <div className="ticket-receipt">
                  <small>TICKET ID</small>
                  <b>CP-{Math.random().toString(36).slice(2, 10).toUpperCase()}</b>
                  <span>● Active and routed</span>
                </div>
                
                <div className="trust-grid">
                  <span><small>Location</small><b>{toilet.name}</b></span>
                  <span><small>Issue</small><b>{rating === 'clean' ? 'No issues reported' : issue}</b></span>
                </div>
                
                <button className="mobile-primary" onClick={closeApp}>Close</button>
              </motion.div>
            )}

            {step === 'cleaner' && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                <div className="mobile-heading">
                  <h1>Who is cleaning?</h1>
                  <p>Select your name to begin duty.</p>
                </div>
                <div className="cleaner-list">
                  {cleaners.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCleaner(c); setStep('pin'); }}>
                      <span className="avatar-icon">{initials(c.full_name)}</span>
                      <div><b>{c.full_name}</b><small>Staff Cleaner</small></div>
                      <ArrowRight size={16} color="var(--text-muted)" />
                    </button>
                  ))}
                  {cleaners.length === 0 && <div className="cleaner-help">No cleaners assigned to this facility.</div>}
                </div>
                <button className="trust-link" onClick={() => setStep('landing')}>Cancel</button>
              </motion.div>
            )}

            {step === 'pin' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <div className="mobile-heading location-block" style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, fontSize: 24, fontWeight: 600, background: 'var(--green-soft)', color: 'var(--green)', padding: 12, borderRadius: 32, marginBottom: 16 }}>{initials(selectedCleaner?.full_name)}</span>
                  <h1>{selectedCleaner?.full_name}</h1>
                  <p>Enter your 4-digit PIN</p>
                </div>
                
                {pinError && <div style={{ color: 'var(--red)', fontSize: 10, textAlign: 'center', background: 'var(--red-bg)', padding: 10, borderRadius: 8 }}>Incorrect PIN. Please try again.</div>}
                
                <div className="pin-display">
                  {[0,1,2,3].map(i => <div key={i} className={`pin-dot ${pin.length > i ? 'filled' : ''}`} />)}
                </div>
                
                <div className="pin-grid">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n} disabled={busy} onClick={() => handlePinInput(pin + n)}>{n}</button>
                  ))}
                  <button disabled={busy} onClick={() => setStep('cleaner')} style={{ fontSize: 14 }}>Back</button>
                  <button disabled={busy} onClick={() => handlePinInput(pin + '0')}>0</button>
                  <button disabled={busy} onClick={() => handlePinInput(pin.slice(0, -1))} style={{ fontSize: 14 }}>Del</button>
                </div>
                {demo && <p className="cleaner-help" style={{ marginTop: 20 }}>Demo PIN: 1234</p>}
              </motion.div>
            )}

            {step === 'ready' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="mobile-heading" style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', padding: 20, borderRadius: 40, background: 'var(--green-bg)', marginBottom: 20 }}>
                    <Sparkles size={40} color="var(--green)" />
                  </div>
                  <h1 style={{ fontSize: 24 }}>Ready to clean</h1>
                  <p>You have been assigned to this block.</p>
                </div>
                
                <div className="cleaning-location">
                  <div className="location-icon">{tm.icon}</div>
                  <div><b>{toilet.name}</b><small>{toilet.code} · {toilet.floor}</small></div>
                </div>
                
                {status === 'alert' && toilet.latest_issue && (
                  <div className="linked-issue">
                    <X size={20} color="var(--red)" />
                    <div><b>Citizen report: {toilet.latest_issue}</b><small>Ensure this is resolved.</small></div>
                  </div>
                )}
                
                <div className="assignment-info">
                  <span><small>Assigned to</small><b>{selectedCleaner?.full_name}</b></span>
                  <span><small>Target time</small><b>15 minutes</b></span>
                </div>
                
                <button className="start-cleaning" disabled={busy} onClick={startCleaning}>
                  {busy ? 'Starting...' : 'START CLEANING'}
                </button>
              </motion.div>
            )}

            {step === 'cleaning' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mobile-heading" style={{ marginBottom: 5 }}>
                  <p>CLEANING IN PROGRESS</p>
                  <div className="cleaning-timer">
                    {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toString().padStart(2, '0')}
                    <span>MINUTES</span>
                  </div>
                </div>
                
                <div className="reminder-grid">
                  <span><b><Sparkles size={20} color="var(--accent)" /></b><small>Floor mopped</small></span>
                  <span><b><Droplets size={20} color="var(--accent)" /></b><small>Basin wiped</small></span>
                  <span><b><Trash2 size={20} color="var(--accent)" /></b><small>Bins emptied</small></span>
                  <span><b><Wind size={20} color="var(--accent)" /></b><small>Smell removed</small></span>
                </div>
                
                <button className="audio-button" onClick={playMarathiReminder}>
                  <Volume2 size={16} /> Play instructions in Marathi
                </button>
                
                <div className="privacy-warning">
                  <b>Photo evidence required</b>
                  <span>Include yourself and the clean facility in the photos.</span>
                </div>
                
                {collageData ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <div className="collage-preview">
                      <img src={collageData} alt="Collage" />
                      <span><CheckCircle size={16} /> Evidence ready</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="secondary" style={{ flex: 1 }} onClick={() => setCollageData(null)}>Retake</button>
                      <button className="complete-button" style={{ flex: 2 }} disabled={busy} onClick={completeCleaning}>
                        {busy ? 'Uploading...' : <><CheckCircle size={16} /> COMPLETE CYCLE</>}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <button className={photoView === 'site' ? 'mobile-primary' : 'secondary'} style={{ flex: 1 }} onClick={() => setPhotoView('site')}>1. Clean site {siteData ? <CheckCircle size={12} /> : ''}</button>
                      <button className={photoView === 'selfie' ? 'mobile-primary' : 'secondary'} style={{ flex: 1, opacity: siteData ? 1 : 0.4 }} onClick={() => siteData && setPhotoView('selfie')}>2. Selfie {selfieData ? <CheckCircle size={12} /> : ''}</button>
                    </div>
                    
                    {photoView === 'site' && (
                      <label className={`camera-box ${siteData ? 'has-photo' : ''}`}>
                        {siteData ? <img src={siteData} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : (
                          <><span><Camera size={32} color="var(--text-muted)" /></span><b>Take photo of clean facility</b><small>Ensure floor and cubicles are visible</small></>
                        )}
                        <input type="file" accept="image/*" capture="environment" onChange={e => setSitePhoto(e.target.files[0])} />
                      </label>
                    )}
                    
                    {photoView === 'selfie' && (
                      <label className={`camera-box ${selfieData ? 'has-photo' : ''}`}>
                        {selfieData ? <img src={selfieData} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : (
                          <><span><User size={32} color="var(--text-muted)" /></span><b>Take selfie in uniform</b><small>Must match registered face</small></>
                        )}
                        <input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files[0])} />
                      </label>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 'complete' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="success-page" style={{ paddingTop: 30 }}>
                <div className="success-check"><CheckCircle size={48} color="var(--green)" /></div>
                <h1>Duty Complete</h1>
                <p>Excellent work. Your cycle is recorded.</p>
                
                {collageData && <img src={collageData} className="completion-collage" alt="Evidence" />}
                
                <div className="completion-card">
                  <span><small>Cleaner</small><b>{selectedCleaner?.full_name}</b></span>
                  <span><small>Duration</small><b>{Math.max(1, Math.round(duration / 60))} minutes</b></span>
                  <span><small>Facility</small><b>{toilet.name}</b></span>
                </div>
                
                <button className="mobile-primary" onClick={closeApp}>Close Shift</button>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
