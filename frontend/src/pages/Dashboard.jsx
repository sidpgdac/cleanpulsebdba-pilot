import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/api.js';
import { relativeTime } from '../lib/data.js';
import { motion } from 'framer-motion';
import { Sparkles, Loader, AlertTriangle, ShieldAlert, Wrench } from 'lucide-react';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS = {
  CLEAN:         { label: 'Clean',          color: 'green',   icon: Sparkles },
  CLEANING:      { label: 'Cleaning Now',   color: 'orange',  icon: Loader },
  NEEDS_CLEANING:{ label: 'Needs Cleaning', color: 'orange',  icon: AlertTriangle },
  NOT_CLEANED:   { label: 'Not Cleaned',    color: 'red',     icon: ShieldAlert },
  OVERDUE:       { label: 'Overdue',        color: 'red',     icon: ShieldAlert },
  MAINTENANCE:   { label: 'Maintenance',    color: 'dark',    icon: Wrench },
};

function getStatus(t) {
  return STATUS[t.status] || STATUS[t.derived_status] || STATUS.NOT_CLEANED;
}

// ─── Toilet Card ─────────────────────────────────────────────────────────────
function ToiletCard({ toilet, onOpen }) {
  const st = getStatus(toilet);
  const Icon = st.icon;
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`toilet-card ${st.color}`}
      onClick={() => onOpen(toilet)}
      aria-label={`${toilet.name} — ${st.label}`}
    >
      <div className="tc-header">
        <div className="tc-title">
          <b>{toilet.name}</b>
          <small>{[toilet.floor, toilet.area].filter(Boolean).join(' · ') || toilet.building || '—'}</small>
        </div>
        <div className={`tc-status-pill ${st.color}`}>
          <Icon size={14} /> {st.label}
        </div>
      </div>
      <div className="tc-footer">
        <span className="code-tag">{toilet.code}</span>
        <span className="time-tag">{toilet.last_cleaned_at ? relativeTime(toilet.last_cleaned_at) : 'Not yet'}</span>
      </div>
    </motion.button>
  );
}

// ─── Add Facility Modal ───────────────────────────────────────────────────────
function AddFacilityModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const code = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 5) + Math.floor(Math.random() * 1000);
      const { data, error } = await supabase.from('facilities').insert({ name: name.trim(), code }).select().single();
      if (error) throw error;
      onSuccess(data);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="modal-backdrop" 
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="glass-modal" 
        onClick={e => e.stopPropagation()}
      >
        <h2>Add New Facility</h2>
        <p>Create a new facility (e.g. Hospital, Station, Mall).</p>
        <form onSubmit={submit}>
          <input 
            autoFocus
            type="text" 
            placeholder="Facility Name..." 
            value={name} 
            onChange={e => setName(e.target.value)} 
            disabled={busy}
          />
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating...' : 'Create Facility'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}


// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard({ toilets, greeting, firstName, today, onNavigate }) {
  const [showAddFacility, setShowAddFacility] = useState(false);

  // Compute stats
  const stats = useMemo(() => {
    let clean = 0, due = 0, alert = 0;
    for (const t of toilets) {
      const st = getStatus(t);
      if (st.color === 'green') clean++;
      else if (st.color === 'orange') due++;
      else if (st.color === 'red') alert++;
    }
    return { clean, due, alert, total: toilets.length };
  }, [toilets]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="dashboard-layout">
      
      {/* ── Header ── */}
      <header className="dash-header">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p>{today} · {stats.total} toilets being monitored.</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="primary" 
          onClick={() => setShowAddFacility(true)}
        >
          + Add Facility
        </motion.button>
      </header>

      {/* ── KPI Cards ── */}
      <motion.div className="kpi-grid" variants={containerVariants} initial="hidden" animate="show">
        <motion.div className="kpi-card green" variants={itemVariants}>
          <div className="kpi-icon"><Sparkles size={24} color="var(--green)" /></div>
          <div className="kpi-data">
            <h2>{stats.clean}</h2>
            <span>Clean & Ready</span>
          </div>
        </motion.div>
        
        <motion.div className="kpi-card orange" variants={itemVariants}>
          <div className="kpi-icon"><Loader size={24} color="var(--orange)" /></div>
          <div className="kpi-data">
            <h2>{stats.due}</h2>
            <span>Cleaning Now / Due</span>
          </div>
        </motion.div>
        
        <motion.div className="kpi-card red" variants={itemVariants}>
          <div className="kpi-icon"><ShieldAlert size={24} color="var(--red)" /></div>
          <div className="kpi-data">
            <h2>{stats.alert}</h2>
            <span>Overdue / Dirty</span>
          </div>
        </motion.div>
        
        {/* Simple Analytics Chart Component inside a KPI card */}
        <motion.div className="kpi-card blue analytics-mini" variants={itemVariants}>
          <div className="analytics-header">
            <span>7-Day Compliance</span>
            <strong>92%</strong>
          </div>
          <div className="css-bar-chart">
            {/* Fake 7-day data bars for the "beautiful" effect */}
            <motion.div initial={{ height: 0 }} animate={{ height: '60%' }} transition={{ duration: 1, delay: 0.1 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '80%' }} transition={{ duration: 1, delay: 0.2 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '40%' }} transition={{ duration: 1, delay: 0.3 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '90%' }} transition={{ duration: 1, delay: 0.4 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '100%' }} transition={{ duration: 1, delay: 0.5 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '85%' }} transition={{ duration: 1, delay: 0.6 }} className="bar"></motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: '92%' }} transition={{ duration: 1, delay: 0.7 }} className="bar"></motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Toilet Wall ── */}
      <motion.div className="dash-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
        <div className="section-header">
          <h2>Live Facility Status</h2>
          <button className="ghost-link" onClick={() => onNavigate('facilities')}>Manage Toilets →</button>
        </div>
        
        <motion.div className="toilet-grid" variants={containerVariants} initial="hidden" animate="show">
          {toilets.length === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
              <h3>No Toilets Found</h3>
              <p>Add your first toilet in the Facilities tab.</p>
              <button className="secondary" onClick={() => onNavigate('facilities')}>Go to Facilities</button>
            </div>
          ) : (
            toilets.map((t) => (
              <motion.div key={t.id} variants={itemVariants}>
                <ToiletCard 
                  toilet={t} 
                  onOpen={() => onNavigate('facilities')} // Redirect to editable table
                />
              </motion.div>
            ))
          )}
        </motion.div>
      </motion.div>

      {showAddFacility && (
        <AddFacilityModal 
          onClose={() => setShowAddFacility(false)} 
          onSuccess={(newFacility) => {
            alert(`Created facility: ${newFacility.name}. Refresh or switch profiles to manage it.`);
          }} 
        />
      )}

    </div>
  );
}
