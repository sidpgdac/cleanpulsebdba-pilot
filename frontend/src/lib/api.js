import { createClient } from '@supabase/supabase-js'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

/**
 * Generic API helper for backend calls.
 * Attaches Supabase JWT for authenticated routes.
 * @param {string} path - Path relative to API_URL (e.g. '/api/cleaner/list')
 * @param {RequestInit} options - Fetch options
 * @param {boolean} useAuth - Whether to attach the Supabase JWT (default: true)
 */
export async function api(path, options = {}, useAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (useAuth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(API_URL + path, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body
}

/**
 * Cleaner API helpers — typed wrappers around the backend /api/cleaner/* routes
 */
export const cleanerApi = {
  /**
   * List active cleaners for a given toilet code.
   * @param {string} toiletCode
   * @returns {Promise<{ cleaners: Array<{id: string, full_name: string}> }>}
   */
  list: (toiletCode) =>
    api('/api/cleaner/list', {
      method: 'POST',
      body: JSON.stringify({ toilet_code: toiletCode }),
    }, false),

  /**
   * Verify PIN and start a cleaning session.
   * Returns { session, cleaner_token, cleaner_name }
   */
  start: ({ toiletCode, cleanerId, pin, idempotencyKey }) =>
    api('/api/cleaner/start', {
      method: 'POST',
      body: JSON.stringify({
        toilet_code: toiletCode,
        cleaner_id: cleanerId,
        pin,
        idempotency_key: idempotencyKey,
      }),
    }, false),

  /**
   * Complete a cleaning session using the short-lived cleaner JWT.
   * This avoids needing to re-enter the PIN on the completion step.
   */
  complete: ({ cleanerToken, sitePhotoPath, selfiePath, lat, lng, accuracy }) =>
    api('/api/cleaner/complete', {
      method: 'POST',
      body: JSON.stringify({
        cleaner_token: cleanerToken,
        site_photo_path: sitePhotoPath,
        selfie_path: selfiePath || '',
        lat: lat || null,
        lng: lng || null,
        accuracy: accuracy || null,
      }),
    }, false),

  /**
   * Upload a photo file. Returns { ok, path }.
   * @param {File} file - The image file
   * @param {string} cleanerToken - Short-lived cleaner JWT
   */
  uploadPhoto: async (file, cleanerToken) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_URL}/api/cleaner/upload?token=${encodeURIComponent(cleanerToken)}`, {
      method: 'POST',
      body: formData,
      // NOTE: Do NOT set Content-Type header when sending FormData — browser sets it with boundary
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Upload failed')
    return body
  },
}

/**
 * Public API helpers — citizen feedback and toilet info
 */
export const publicApi = {
  /**
   * Get toilet info for QR landing page.
   * @param {string} code - The toilet code (e.g. 'BDBA-T001')
   */
  getToilet: (code) =>
    api(`/api/public/toilets/${encodeURIComponent(code)}`, {}, false),

  /**
   * Submit citizen feedback.
   */
  submitFeedback: ({ toiletCode, category }) =>
    api('/api/public/feedback', {
      method: 'POST',
      body: JSON.stringify({ toilet_code: toiletCode, category }),
    }, false),

  /**
   * Get the URL for the Marathi audio instructions.
   */
  audioUrl: () => `${API_URL}/api/public/audio/instructions`,
}

export const META = {
  NOT_CLEANED: ['Not Cleaned', 'danger'],
  NEEDS_CLEANING: ['Needs Cleaning', 'danger'],
  OVERDUE: ['Overdue', 'warning'],
  CLEANING: ['Cleaning Now', 'working'],
  MAINTENANCE: ['Repair Needed', 'repair'],
  CLEAN: ['Clean', 'clean'],
}
