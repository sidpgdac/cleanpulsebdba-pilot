import React, { useState, useEffect, useMemo } from 'react'
import QRCode from 'react-qr-code'
import { Search, Printer, Download, Link } from 'lucide-react'
import { supabase } from '../../lib/api'

export default function QRCentre() {
  const [facilities, setFacilities] = useState([])
  const [selectedFacility, setSelectedFacility] = useState('')
  const [qrs, setQrs] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL') // ALL, ACTIVE, INACTIVE, NEVER_PRINTED
  
  const [printMode, setPrintMode] = useState(false)

  useEffect(() => {
    loadFacilities()
  }, [])

  useEffect(() => {
    if (selectedFacility) {
      loadQRs(selectedFacility)
    } else {
      setQrs([])
    }
  }, [selectedFacility])

  async function loadFacilities() {
    try {
      const { data } = await supabase.from('facilities').select('*').order('name');
      setFacilities(data || [])
      if (data && data.length > 0) {
        setSelectedFacility(data[0].id)
      }
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadQRs(facilityId) {
    try {
      const { data } = await supabase.from('qr_codes').select('*, toilets(name,code,building,floor,area)').eq('facility_id', facilityId).order('created_at', { ascending: false })
      setQrs(data || [])
    } catch (e) {
      alert(e.message)
    }
  }

  const visible = useMemo(() => {
    return qrs.filter(row => {
      const text = `${row.toilets?.name} ${row.qr_code} ${row.toilets?.area || ''}`.toLowerCase()
      if (search && !text.includes(search.toLowerCase())) return false
      
      if (filter === 'ACTIVE') return row.status === 'ACTIVE'
      if (filter === 'INACTIVE') return row.status === 'INACTIVE'
      if (filter === 'NEVER_PRINTED') return !row.last_printed_at
      return true
    })
  }, [qrs, search, filter])

  function handleDownload(toiletId) {
    window.location.href = `/api/admin/qr/${toiletId}/png`
  }

  if (loading) return <div style={{padding: '2rem'}}>Loading QR Centre...</div>

  if (printMode) {
    return (
      <div className="printLayout">
        <div className="no-print" style={{padding: 20, background: '#f0f0f0', display: 'flex', justifyContent: 'space-between'}}>
          <button onClick={() => setPrintMode(false)}>← Back to Admin</button>
          <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
        <div className="stickerSheet">
          {visible.map(qr => (
            <div key={qr.id} className="sticker">
              <div className="stickerHeader">BMC CLEANPULSE</div>
              <div className="stickerFacility">{qr.facilities?.name}</div>
              
              <div className="stickerToiletInfo">
                <div className="stickerToiletName">{qr.toilets?.name}</div>
                <div className="stickerCode">{qr.qr_code}</div>
              </div>
              
              <div className="stickerQRWrapper">
                <QRCode value={qr.target_url} size={150} level="H" />
              </div>
              
              <div className="stickerFooter">
                <strong>SCAN HERE</strong>
                <p>Cleanliness Feedback<br/>Cleaning Staff</p>
                <p style={{fontSize: '0.85em'}}>स्वच्छता अभिप्राय<br/>साफसफाई कर्मचारी</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="adminSection">
      <header className="sectionHeader">
        <div>
          <h1>QR Centre</h1>
          <p>Manage, generate, and print permanent physical QR stickers.</p>
        </div>
        <div className="actions">
          <select value={selectedFacility} onChange={e => setSelectedFacility(e.target.value)}>
            <option value="">-- Choose Facility --</option>
            {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="primary" disabled={!selectedFacility || visible.length === 0} onClick={() => setPrintMode(true)}>
            <Printer size={16} style={{marginRight: 6}} /> PRINT ALL ({visible.length})
          </button>
        </div>
      </header>

      <div className="toolbar" style={{marginTop: 24, marginBottom: 24}}>
        <div className="tabs">
          {['ALL', 'ACTIVE', 'INACTIVE', 'NEVER_PRINTED'].map(v => (
            <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
              {v.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="searchBox" style={{marginTop: 0}}>
          <Search size={18} />
          <input
            placeholder="Search by code or location"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="qrGrid">
        {visible.map(qr => (
          <div key={qr.id} className="qrCard">
            <div className="qrHeader">
              <div>
                <strong>{qr.qr_code}</strong>
                <div className={`statusBadge ${qr.status === 'ACTIVE' ? 'clean' : 'danger'}`}>
                  {qr.status}
                </div>
              </div>
            </div>
            
            <div className="qrVisual">
              <QRCode value={qr.target_url} size={120} level="H" />
            </div>

            <div className="qrInfo">
              <h3>{qr.toilets?.name}</h3>
              <p className="loc">{[qr.toilets?.area, qr.toilets?.floor, qr.toilets?.building].filter(Boolean).join(' · ')}</p>
              <p className="units">{qr.internal_units_count} Internal Units</p>
            </div>

            <div className="qrActions">
              <button onClick={() => window.open(`/t/${qr.qr_code}`, '_blank')} title="Open Toilet Page">
                <Link size={16} />
              </button>
              <button onClick={() => handleDownload(qr.toilet_id)} title="Download PNG">
                <Download size={16} /> PNG
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
