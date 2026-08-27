import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, api } from '../../lib/api.js';
import { statusMeta, toiletTypeMeta, issueOptions, initials, buildEvidenceCollage } from '../../lib/data.js';

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
    
    // Fire and forget QR scan tracking
    api('/api/public/qr-scan', { method: 'POST', body: JSON.stringify({ toiletCode: code }) }, false).catch(() => {});

    // Load toilet
    api(`/api/public/toilets/${encodeURIComponent(code)}`, {}, false)
      .then(body => {
        if (!body.data) throw new Error(body.error || 'Toilet not found');
        setToilet(body.data);
      })
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
    return <div className="loadingScreen"><div className="logo pulse">✦</div><b style={{fontSize:11,color:'var(--muted)'}}>LOADING</b></div>;
  }

  if (!toilet) {
    return (
      <div className="experience-backdrop">
        <div className="invalid-qr">
          <span>×</span>
          <h1>Invalid CleanPulse QR</h1>
          <p><b>{code}</b> is not an active toilet ID.</p>
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
        await api('/api/public/feedback', {
          method: 'POST',
          body: JSON.stringify({ toiletCode: code, category: issue })
        }, false);
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
      setCleaners([{ id: 'c1', full_name: 'Amit Patel', phone: '9876543210' }]);
      return;
    }
    try {
      const res = await api(`/api/public/toilets/${code}/cleaners`, {}, false);
      setCleaners(res.data || []);
    } catch (e) {
      alert('Could not load cleaners');
    }
  }

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
        const result = await api('/api/cleaning/login', {
          method: 'POST',
          body: JSON.stringify({ toiletCode: code, cleanerId: selectedCleaner.id, pin })
        }, false);
        setCleanerToken(result.token);
        if (result.activeSession) {
          setSession(result.activeSession);
          setStep('cleaning');
        } else {
          setStep('ready');
        }
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
        const result = await api('/api/cleaning/start', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cleanerToken}` },
          body: JSON.stringify({ toiletCode: code, idempotencyKey: crypto.randomUUID() })
        }, false);
        setSession(result.data);
        setStep('cleaning');
      }
    } catch (e) {
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
      } else {
        const res = await fetch('/api/public/audio/instructions'); // Assuming this exists or falls back
        if (!res.ok) throw new Error('Audio not found');
        const blob = await res.blob();
        const a = new Audio(URL.createObjectURL(blob));
        setMarathiAudio(a);
        a.play();
      }
    } catch (e) {
      alert('Audio instructions not available.');
    }
  }

  async function uploadFile(file, kind) {
    if (demo) return 'demo-path';
    const signed = await api(`/api/cleaning/${session.id}/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cleanerToken}` },
      body: JSON.stringify({ kind, contentType: file.type || 'image/jpeg' })
    }, false);
    const { error } = await supabase.storage
      .from('cleaning-evidence')
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    return signed.path;
  }

  async function completeCleaning() {
    if (!collageData) return alert('Photo evidence required.');
    setBusy(true);
    try {
      if (demo) {
        onUpdate({ ...toilet, derived_status: 'CLEAN', last_cleaned_at: new Date().toISOString(), latest_issue: null, attention_minutes: null });
        setStep('complete');
      } else {
        // Convert base64 collage to Blob
        const fetchResponse = await fetch(collageData);
        const collageBlob = await fetchResponse.blob();
        
        const sitePhotoPath = await uploadFile(collageBlob, 'site');
        const selfiePath = ''; // We don't need a separate selfie since it's in the collage
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
        await api(`/api/cleaning/${session.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cleanerToken}` },
          body: JSON.stringify({ sitePhotoPath, selfiePath, gps })
        }, false);
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
    if (v.length === 4) {
      setTimeout(() => verifyPin(), 100);
    }
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
          <header className="mobile-brand">
            <div>
              <span>CP</span>
              <div>
                <b>CleanPulse</b>
                <small>BMC HEALTH</small>
              </div>
            </div>
            {demo && <button onClick={onClose}>×</button>}
          </header>

          <main className="mobile-page">
            {step === 'landing' && (
              <>
                <div className="mobile-heading location-block">
                  <p>{(toilet.facility_name || 'BDBA SHATABDI HOSPITAL').toUpperCase()}</p>
                  <div className={`mobile-type-badge ${tm.tone}`}>
                    <i>{tm.icon}</i>
                    <div><b>{tm.english}</b><small>{tm.marathi}</small></div>
                  </div>
                  <h1>{toilet.name}</h1>
                  <p>{[toilet.floor, toilet.area].filter(Boolean).join(' · ')}</p>
                </div>

                <div className={`public-status ${status}`}>
                  <b>{sm.label}</b>
                  <small>Status logged: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small>
                </div>

                <div className="role-choices">
                  <p>SELECT REASON FOR SCAN</p>
                  <button onClick={() => setStep('rating')}>
                    <span>🙂</span>
                    <div>
                      <b>Citizen Feedback</b>
                      <small>Report a problem or rate cleanliness</small>
                    </div>
                    <i>→</i>
                  </button>
                  <button onClick={loadCleaners}>
                    <span>🧹</span>
                    <div>
                      <b>Cleaning Staff</b>
                      <small>Start or complete cleaning duty</small>
                    </div>
                    <i>→</i>
                  </button>
                </div>

                <div className="trust-score">
                  <span>FACILITY CLEANLINESS SCORE</span>
                  <strong>94%</strong>
                  <small>BMC SHATABDI HOSPITAL</small>
                </div>
              </>
            )}

            {step === 'rating' && (
              <>
                <div className="mobile-heading">
                  <h1>How is the toilet?</h1>
                  <p>Your anonymous feedback holds teams accountable.</p>
                </div>
                <div className="rating-stack">
                  <button onClick={() => { setRating('clean'); setStep('thanks'); }}>
                    <span>🙂</span><div><b>Clean & functioning</b><small>Everything is good</small></div>
                  </button>
                  <button className="attention-choice" onClick={() => { setRating('attention'); setStep('issue'); }}>
                    <span>😐</span><div><b>Needs attention</b><small>Wet floor, no soap, or dirty</small></div>
                  </button>
                  <button className="urgent-choice" onClick={() => { setRating('urgent'); setStep('issue'); }}>
                    <span>🤢</span><div><b>Urgent problem</b><small>Blocked, broken, or unusable</small></div>
                  </button>
                </div>
              </>
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
              <>
                <div className="mobile-heading">
                  <h1>Where exactly?</h1>
                  <p>Help staff find the problem.</p>
                </div>
                <div className="location-options">
                  <button className={unit === 'whole' ? 'selected' : ''} onClick={() => setUnit('whole')}>
                    <span>▣</span><div><b>Whole block</b><small>General issue</small></div>
                  </button>
                  {Array.from({ length: toilet.total_units || 4 }).map((_, i) => (
                    <button key={i} className={unit === `U${i+1}` ? 'selected' : ''} onClick={() => setUnit(`U${i+1}`)}>
                      <span>{i+1}</span><div><b>Cubicle {i+1}</b><small>Internal unit</small></div>
                    </button>
                  ))}
                </div>
                <label className="optional-photo">
                  <span>📷</span>
                  <div><b>Add photo (optional)</b><small>Helps teams fix faster</small></div>
                  <input type="file" accept="image/*" />
                </label>
                <button className="mobile-primary" disabled={busy} onClick={submitFeedback}>
                  {busy ? 'Submitting…' : 'Submit report'}
                </button>
              </>
            )}

            {step === 'thanks' && (
              <div className="success-page">
                <div className="success-check">✓</div>
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
              </div>
            )}

            {step === 'cleaner' && (
              <>
                <div className="mobile-heading">
                  <h1>Who is cleaning?</h1>
                  <p>Select your name to begin duty.</p>
                </div>
                <div className="cleaner-list">
                  {cleaners.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCleaner(c); setStep('pin'); }}>
                      <span>{initials(c.full_name)}</span>
                      <div><b>{c.full_name}</b><small>Staff Cleaner</small></div>
                      <i>→</i>
                    </button>
                  ))}
                  {cleaners.length === 0 && <div className="cleaner-help">No cleaners assigned to this facility.</div>}
                </div>
                <button className="trust-link" onClick={() => setStep('landing')}>Cancel</button>
              </>
            )}

            {step === 'pin' && (
              <>
                <div className="mobile-heading location-block">
                  <span style={{ fontSize: 32, background: 'var(--green-soft)', padding: 12, borderRadius: 16 }}>{initials(selectedCleaner?.full_name)}</span>
                  <h1>{selectedCleaner?.full_name}</h1>
                  <p>Enter your 4-digit PIN</p>
                </div>
                
                {pinError && <div style={{ color: 'var(--red)', fontSize: 10, textAlign: 'center', background: 'var(--red-soft)', padding: 10, borderRadius: 8 }}>Incorrect PIN. Please try again.</div>}
                
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
              </>
            )}

            {step === 'ready' && (
              <>
                <div className="mobile-heading">
                  <h1 style={{ fontSize: 42, margin: '20px 0' }}>🧹</h1>
                  <h1 style={{ fontSize: 24 }}>Ready to clean</h1>
                  <p>You have been assigned to this block.</p>
                </div>
                
                <div className="cleaning-location">
                  <span>{tm.icon}</span>
                  <div><b>{toilet.name}</b><small>{toilet.code} · {toilet.floor}</small></div>
                </div>
                
                {status === 'alert' && toilet.latest_issue && (
                  <div className="linked-issue">
                    <span>!</span>
                    <div><b>Citizen report: {toilet.latest_issue}</b><small>Ensure this is resolved.</small></div>
                  </div>
                )}
                
                <div className="assignment-info">
                  <span><small>Assigned to</small><b>{selectedCleaner?.full_name}</b></span>
                  <span><small>Target time</small><b>15 minutes</b></span>
                </div>
                
                <button className="start-cleaning" disabled={busy} onClick={startCleaning}>
                  {busy ? 'Starting…' : 'START CLEANING'}
                </button>
              </>
            )}

            {step === 'cleaning' && (
              <>
                <div className="mobile-heading" style={{ marginBottom: 5 }}>
                  <p>CLEANING IN PROGRESS</p>
                  <div className="cleaning-timer">
                    {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toString().padStart(2, '0')}
                    <span>MINUTES</span>
                  </div>
                </div>
                
                <div className="reminder-grid">
                  <span><b>🧹</b><small>Floor mopped</small></span>
                  <span><b>🚽</b><small>Cubicles washed</small></span>
                  <span><b>🚰</b><small>Basin wiped</small></span>
                  <span><b>🧼</b><small>Soap filled</small></span>
                  <span><b>🗑️</b><small>Bins emptied</small></span>
                  <span><b>💨</b><small>Smell removed</small></span>
                </div>
                
                <button className="audio-button" onClick={playMarathiReminder}>
                  🔊 Play instructions in Marathi
                </button>
                
                <div className="privacy-warning">
                  <b>Photo evidence required</b>
                  <span>Include yourself and the clean facility in the photos.</span>
                </div>
                
                {collageData ? (
                  <>
                    <div className="collage-preview">
                      <img src={collageData} alt="Collage" />
                      <span>✓ Evidence ready</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="secondary" style={{ flex: 1 }} onClick={() => setCollageData(null)}>Retake</button>
                      <button className="complete-button" style={{ flex: 2 }} disabled={busy} onClick={completeCleaning}>
                        {busy ? 'Uploading…' : '✓ COMPLETE CYCLE'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <button className={photoView === 'site' ? 'mobile-primary' : 'secondary'} style={{ flex: 1 }} onClick={() => setPhotoView('site')}>1. Clean site {siteData ? '✓' : ''}</button>
                      <button className={photoView === 'selfie' ? 'mobile-primary' : 'secondary'} style={{ flex: 1, opacity: siteData ? 1 : 0.4 }} onClick={() => siteData && setPhotoView('selfie')}>2. Selfie {selfieData ? '✓' : ''}</button>
                    </div>
                    
                    {photoView === 'site' && (
                      <label className={`camera-box ${siteData ? 'has-photo' : ''}`}>
                        {siteData ? <img src={siteData} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : (
                          <><span>📷</span><b>Take photo of clean facility</b><small>Ensure floor and cubicles are visible</small></>
                        )}
                        <input type="file" accept="image/*" capture="environment" onChange={e => setSitePhoto(e.target.files[0])} />
                      </label>
                    )}
                    
                    {photoView === 'selfie' && (
                      <label className={`camera-box ${selfieData ? 'has-photo' : ''}`}>
                        {selfieData ? <img src={selfieData} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : (
                          <><span>🤳</span><b>Take selfie in uniform</b><small>Must match registered face</small></>
                        )}
                        <input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files[0])} />
                      </label>
                    )}
                  </>
                )}
              </>
            )}

            {step === 'complete' && (
              <div className="success-page" style={{ paddingTop: 30 }}>
                <div className="success-check">✓</div>
                <h1>Duty Complete</h1>
                <p>Excellent work. Your cycle is recorded.</p>
                
                {collageData && <img src={collageData} className="completion-collage" alt="Evidence" />}
                
                <div className="completion-card">
                  <span><small>Cleaner</small><b>{selectedCleaner?.full_name}</b></span>
                  <span><small>Duration</small><b>{Math.max(1, Math.round(duration / 60))} minutes</b></span>
                  <span><small>Facility</small><b>{toilet.name}</b></span>
                </div>
                
                <button className="mobile-primary" onClick={closeApp}>Close Shift</button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
