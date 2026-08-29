import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/api'

export default function FacilityFactory() {
  const [facilities, setFacilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('list') // 'list', 'new_facility', 'new_toilet'
  const [busy, setBusy] = useState(false)
  
  const [selectedFacility, setSelectedFacility] = useState('')
  
  // New Facility Form
  const [fCode, setFCode] = useState('')
  const [fName, setFName] = useState('')
  
  // New Toilet Form
  const [tName, setTName] = useState('')
  const [tBuilding, setTBuilding] = useState('')
  const [tFloor, setTFloor] = useState('')
  const [tArea, setTArea] = useState('')
  const [tUnits, setTUnits] = useState(0)
  const [tInterval, setTInterval] = useState(120)
  
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => {
    loadFacilities()
  }, [])

  async function loadFacilities() {
    try {
      const { data } = await supabase.from('facilities').select('*').order('name')
      setFacilities(data || [])
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function createFacility(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { data } = await supabase.from('facilities').insert({
        code: fCode.toUpperCase(),
        name: fName
      }).select().single();
      await loadFacilities()
      setSelectedFacility(data.id)
      setMode('list')
      setFCode('')
      setFName('')
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function createToilet(e) {
    e.preventDefault()
    if (!selectedFacility) return alert('Select a facility first')
    setBusy(true)
    setSuccessMsg(null)
    try {
      const session = await supabase.auth.getSession();
      const { data } = await supabase.rpc('create_toilet_with_qr', {
        p_facility_id: selectedFacility,
        p_building: tBuilding,
        p_floor: tFloor,
        p_area: tArea,
        p_name: tName,
        p_toilet_type: null,
        p_num_units: Number(tUnits),
        p_cleaning_interval_minutes: Number(tInterval),
        p_actor_id: session.data.session.user.id,
        p_public_app_url: window.location.origin
      });
      
      setSuccessMsg({
        code: data.toilet_code,
        name: tName,
        units: tUnits,
        url: data.target_url
      })
      
      setTName('')
      setTBuilding('')
      setTFloor('')
      setTArea('')
      setTUnits(0)
      setTInterval(120)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div style={{padding: '2rem'}}>Loading factory...</div>

  return (
    <div className="adminSection">
      <header className="sectionHeader">
        <div>
          <h1>Facilities & Toilets</h1>
          <p>Create operational facilities and generate new toilets with QRs.</p>
        </div>
        <div className="actions">
          {mode !== 'list' && <button onClick={() => setMode('list')}>Cancel</button>}
          {mode === 'list' && (
            <>
              <button onClick={() => setMode('new_facility')}>+ Add Facility</button>
              <button className="primary" onClick={() => setMode('new_toilet')}>+ Add Toilet</button>
            </>
          )}
        </div>
      </header>

      <div className="factoryGrid">
        <AnimatePresence mode="wait">
          {mode === 'list' && (
            <motion.div key="list" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
              <div className="card">
                <h3>Select Working Facility</h3>
                <select value={selectedFacility} onChange={e => setSelectedFacility(e.target.value)} style={{width: '100%', padding: 12, marginTop: 12}}>
                  <option value="">-- Choose Facility --</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                  ))}
                </select>
                {selectedFacility && (
                  <p style={{marginTop: 16, color: '#666'}}>
                    Ready to add toilets and staff for this facility. Click "+ Add Toilet" to proceed.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'new_facility' && (
            <motion.form key="new_facility" onSubmit={createFacility} className="card formCard" initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0}}>
              <h3>Create New Facility</h3>
              <label>Facility Name
                <input required value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. KEM Hospital" />
              </label>
              <label>Facility Code (Short, Unique)
                <input required value={fCode} onChange={e => setFCode(e.target.value.toUpperCase())} placeholder="e.g. KEM" />
              </label>
              <button type="submit" disabled={busy} className="primary">Create Facility</button>
            </motion.form>
          )}

          {mode === 'new_toilet' && (
            <motion.form key="new_toilet" onSubmit={createToilet} className="card formCard" initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0}}>
              <h3>Create New Toilet & QR</h3>
              
              <label>Facility
                <select required value={selectedFacility} onChange={e => setSelectedFacility(e.target.value)}>
                  <option value="">-- Choose Facility --</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
                <label>Building / Wing
                  <input value={tBuilding} onChange={e => setTBuilding(e.target.value)} placeholder="Main Building" />
                </label>
                <label>Floor
                  <input value={tFloor} onChange={e => setTFloor(e.target.value)} placeholder="Ground Floor" />
                </label>
                <label>Department / Area
                  <input value={tArea} onChange={e => setTArea(e.target.value)} placeholder="OPD" />
                </label>
              </div>

              <label>Toilet Name (Publicly Visible)
                <input required value={tName} onChange={e => setTName(e.target.value)} placeholder="OPD Female Toilet" />
              </label>
              
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                <label>Number of Internal Units (0-100)
                  <input type="number" min="0" max="100" required value={tUnits} onChange={e => setTUnits(e.target.value)} />
                </label>
                <label>Cleaning Frequency (minutes)
                  <input type="number" min="10" required value={tInterval} onChange={e => setTInterval(e.target.value)} />
                </label>
              </div>

              <button type="submit" disabled={busy || !selectedFacility} className="primary">
                {busy ? 'Generating Atomic QR...' : 'CREATE TOILET + QR'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {successMsg && (
          <motion.div className="card successCard" initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}}>
            <div className="icon">✓</div>
            <h2>Toilet Created</h2>
            <div className="details">
              <b>{successMsg.code}</b>
              <p>{successMsg.name}</p>
              <p>{successMsg.units} Units</p>
              <p className="ready">QR Ready</p>
            </div>
            <div className="actions" style={{marginTop: 16}}>
              <a href={`/t/${successMsg.code}`} target="_blank" rel="noreferrer" className="button">Open Toilet Page</a>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
