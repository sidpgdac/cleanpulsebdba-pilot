import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Wrench,
  Search
} from 'lucide-react'
import { supabase, api } from '../../lib/api.js'

const META_ICONS = {
  NOT_CLEANED: AlertTriangle,
  NEEDS_CLEANING: AlertTriangle,
  OVERDUE: Clock3,
  CLEANING: RefreshCw,
  MAINTENANCE: Wrench,
  CLEAN: CheckCircle2
}

const META_LABELS = {
  NOT_CLEANED: ['Not Cleaned', 'danger'],
  NEEDS_CLEANING: ['Needs Cleaning', 'danger'],
  OVERDUE: ['Overdue', 'warning'],
  CLEANING: ['Cleaning Now', 'working'],
  MAINTENANCE: ['Repair Needed', 'repair'],
  CLEAN: ['Clean', 'clean']
}

function Detail({ label, value }) {
  return <div className="detail"><small>{label}</small><b>{value}</b></div>
}

function SupervisorLogin({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return setError(error.message)
    onSuccess()
  }

  return (
    <div className="loginPage">
      <motion.form
        className="loginCard"
        initial={{ opacity: 0, y: 24, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onSubmit={submit}
      >
        <div className="logo">✦</div>
        <div className="eyebrow">BMC CleanPulse</div>
        <h1>Supervisor</h1>
        <p>Only what needs attention. Nothing complicated.</p>

        <label>Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />

        <label>Password</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />

        {error && <div className="errorBox">{error}</div>}

        <button className="primary" disabled={busy}>
          {busy ? 'Opening…' : 'Open CleanPulse'}
        </button>
      </motion.form>
    </div>
  )
}

export default function SupervisorApp() {
  const [profile, setProfile] = useState(null)
  const [overview, setOverview] = useState(null)
  const [rows, setRows] = useState([])
  const [ready, setReady] = useState(false)
  const [filter, setFilter] = useState('ACTION')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setProfile(null)
      setReady(true)
      return
    }

    const { data: p } = await supabase
      .from('profiles')
      .select('id,full_name,role,facility_id,facilities(name)')
      .eq('id', session.user.id)
      .single()

    if (!p) {
      setProfile(null)
      setReady(true)
      return
    }

    setProfile(p)

    try {
      const { data: bData, error } = await supabase
        .from('supervisor_toilet_view')
        .select('*')
        .eq('facility_id', p.facility_id)
        .order('attention_minutes', { ascending: false, nullsFirst: false })

      if (error) throw error;

      let result = { not_cleaned: 0, overdue: 0, cleaning_now: 0, clean: 0, maintenance: 0, open_complaints: 0 }
      for (const t of bData || []) {
        if (['NOT_CLEANED', 'NEEDS_CLEANING'].includes(t.derived_status)) result.not_cleaned++
        if (t.derived_status === 'OVERDUE') result.overdue++
        if (t.derived_status === 'CLEANING') result.cleaning_now++
        if (t.derived_status === 'CLEAN') result.clean++
        if (t.derived_status === 'MAINTENANCE') result.maintenance++
        result.open_complaints += Number(t.open_complaints || 0)
      }
      result.action_required = result.not_cleaned + result.overdue + result.maintenance

      setOverview(result)
      setRows(bData || [])
    } catch(err) {
      console.error(err)
    }
    setReady(true)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!profile?.facility_id) return

    const channel = supabase
      .channel(`cleanpulse-${profile.facility_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'toilets',
          filter: `facility_id=eq.${profile.facility_id}`
        },
        () => load()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.facility_id])

  const visible = useMemo(() => {
    return rows
      .filter(row => {
        const text = `${row.name} ${row.code} ${row.area || ''} ${row.floor || ''} ${row.building || ''}`.toLowerCase()
        if (search && !text.includes(search.toLowerCase())) return false

        if (filter === 'ACTION') {
          return ['NOT_CLEANED', 'NEEDS_CLEANING', 'OVERDUE', 'MAINTENANCE'].includes(row.derived_status)
        }
        if (filter === 'CLEANING') return row.derived_status === 'CLEANING'
        if (filter === 'CLEAN') return row.derived_status === 'CLEAN'
        return true
      })
      .sort((a, b) => (b.attention_minutes || 0) - (a.attention_minutes || 0))
  }, [rows, search, filter])

  if (!ready) {
    return <div className="loadingScreen"><div className="logo pulse">✦</div><b>Opening CleanPulse…</b></div>
  }

  if (!profile) {
    return <SupervisorLogin onSuccess={load} />
  }
  
  if (profile.role === 'admin') {
    // If admin tries to load supervisor app directly, we let them or guide them. 
    // In our App.jsx we'll route based on role.
  }

  return (
    <main className="commandApp">
      <header className="topbar">
        <div className="brand">
          <div className="logo miniLogo">✦</div>
          <div><b>BMC CleanPulse</b><span>Supervisor Operations</span></div>
        </div>
        <div className="live"><i /> LIVE</div>
      </header>

      <div className="shell">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="hero">
          <div className="eyebrow">Hospital cleanliness</div>
          <h1>What needs <em>attention?</em></h1>
          <p>{profile.facilities?.name} · {profile.full_name}</p>
        </motion.section>

        <motion.section className="urgent" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="bang">!</div>
          <div>
            <small>DO THIS FIRST</small>
            <h2>{overview?.action_required || 0} toilets need action</h2>
            <p>Longest waiting toilet is automatically shown first.</p>
          </div>
          <div className="urgentNumbers">
            <b>{overview?.not_cleaned || 0}<span>Not cleaned</span></b>
            <b>{overview?.overdue || 0}<span>Overdue</span></b>
            <b>{overview?.open_complaints || 0}<span>Complaints</span></b>
          </div>
        </motion.section>

        <section className="metrics">
          {[
            ['Not Cleaned', overview?.not_cleaned, 'danger', AlertTriangle],
            ['Overdue', overview?.overdue, 'warning', Clock3],
            ['Cleaning Now', overview?.cleaning_now, 'working', RefreshCw],
            ['Clean', overview?.clean, 'clean', CheckCircle2],
            ['Repair', overview?.maintenance, 'repair', Wrench]
          ].map(([label, value, tone, Icon], index) => (
            <motion.div
              key={label}
              className={`metric ${tone}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * .05 }}
            >
              <Icon />
              <strong>{value || 0}</strong>
              <span>{label}</span>
            </motion.div>
          ))}
        </section>

        <section className="toolbar">
          <div>
            <h2>Toilets</h2>
            <p>Red first. No complicated dashboard.</p>
          </div>
          <div className="tabs">
            {['ACTION', 'ALL', 'CLEANING', 'CLEAN'].map(value => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'ACTION' ? 'Needs Action' : value}
              </button>
            ))}
          </div>
        </section>

        <div className="searchBox">
          <Search size={18} />
          <input
            placeholder="Search toilet, floor or area"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="toiletList">
          <AnimatePresence>
            {visible.map((row, index) => {
              const metaL = META_LABELS[row.derived_status] || META_LABELS.CLEAN
              const label = metaL[0]
              const tone = metaL[1]
              const Icon = META_ICONS[row.derived_status] || META_ICONS.CLEAN
              return (
                <motion.button
                  layout
                  key={row.id}
                  className={`toiletRow ${tone}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(index * .03, .2) }}
                  onClick={() => setSelected(row)}
                >
                  <div className="statusIcon"><Icon /></div>
                  <div className="toiletCopy">
                    <h3>{row.name}</h3>
                    <p>{[row.area, row.floor, row.building].filter(Boolean).join(' · ')}</p>
                    <div className="chips">
                      <span>{row.code}</span>
                      <span>Last cleaned: {row.last_cleaned_at ? new Date(row.last_cleaned_at).toLocaleString('en-IN') : 'Never'}</span>
                      {row.open_complaints > 0 && <span>⚠ {row.open_complaints} complaint(s)</span>}
                    </div>
                  </div>
                  <div className={`badge ${tone}`}>{label}</div>
                  <div className="waiting">
                    <b>{row.attention_minutes ? `${row.attention_minutes} min` : 'OK'}</b>
                    <span>{row.attention_minutes ? 'Waiting' : 'No action'}</span>
                  </div>
                  <span className="arrow">→</span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)}>
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28 }}
              onClick={e => e.stopPropagation()}
            >
              <button className="close" onClick={() => setSelected(null)}>×</button>
              <div className={`drawerHero ${(META_LABELS[selected.derived_status] || META_LABELS.CLEAN)[1]}`}>
                <small>{selected.code}</small>
                <h2>{selected.name}</h2>
                <b>{(META_LABELS[selected.derived_status] || META_LABELS.CLEAN)[0]}</b>
              </div>
              <div className="detailGrid">
                <Detail label="Location" value={selected.area || '—'} />
                <Detail label="Floor" value={selected.floor || '—'} />
                <Detail label="Last Cleaner" value={selected.last_cleaner_name || '—'} />
                <Detail label="Complaints" value={selected.open_complaints || 0} />
                <Detail label="Waiting" value={selected.attention_minutes ? `${selected.attention_minutes} min` : 'No action'} />
                <Detail label="Current Cleaner" value={selected.current_cleaner_name || '—'} />
              </div>
              <div className="note">
                {selected.derived_status === 'CLEANING'
                  ? 'Cleaning is already happening. No supervisor action is needed.'
                  : selected.derived_status === 'MAINTENANCE'
                    ? 'Repair is pending. Cleaning cannot close this issue.'
                    : selected.derived_status === 'CLEAN'
                      ? 'This toilet is clean. No action is required.'
                      : 'This toilet is waiting for any available authorized cleaner.'}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
