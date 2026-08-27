import { createClient } from '@supabase/supabase-js'

export const API = import.meta.env.VITE_API_URL

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

export async function api(path, options = {}, useAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (useAuth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(API + path, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body
}

export const META = {
  NOT_CLEANED: ['Not Cleaned', 'danger'],
  NEEDS_CLEANING: ['Needs Cleaning', 'danger'],
  OVERDUE: ['Overdue', 'warning'],
  CLEANING: ['Cleaning Now', 'working'],
  MAINTENANCE: ['Repair Needed', 'repair'],
  CLEAN: ['Clean', 'clean']
}
