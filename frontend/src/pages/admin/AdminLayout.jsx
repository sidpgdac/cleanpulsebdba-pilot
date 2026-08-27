import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/api'

export default function AdminLayout() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/')
        return
      }

      const { data: p } = await supabase
        .from('profiles')
        .select('id,role,full_name')
        .eq('id', session.user.id)
        .single()

      if (!p || p.role !== 'admin') {
        setProfile('unauthorized')
      } else {
        setProfile(p)
      }
      setLoading(false)
    }
    checkAuth()
  }, [navigate])

  if (loading) {
    return <div className="loadingScreen"><div className="logo pulse">✦</div><b>Opening Admin…</b></div>
  }

  if (profile === 'unauthorized') {
    return (
      <div className="adminShell">
        <div className="flowCard" style={{ margin: '4rem auto', maxWidth: 400 }}>
          <h2>Access Denied</h2>
          <p>You do not have administrative privileges.</p>
          <button onClick={() => navigate('/')}>Return to Supervisor view</button>
        </div>
      </div>
    )
  }

  return (
    <div className="adminShell">
      <nav className="adminNav">
        <div className="brand">
          <div className="logo miniLogo">✦</div>
          <div><b>BMC CleanPulse</b><span>Admin Command Centre</span></div>
        </div>
        <div className="navLinks">
          <NavLink to="/admin/facilities" className={({isActive}) => isActive ? 'active' : ''}>Facilities</NavLink>
          <NavLink to="/admin/qr" className={({isActive}) => isActive ? 'active' : ''}>QR Centre</NavLink>
          <NavLink to="/admin/staff" className={({isActive}) => isActive ? 'active' : ''}>Staff</NavLink>
          <NavLink to="/admin/settings" className={({isActive}) => isActive ? 'active' : ''}>Settings</NavLink>
        </div>
        <div className="navProfile">
          {profile.full_name}
        </div>
      </nav>

      <main className="adminContent">
        <Outlet />
      </main>
    </div>
  )
}
