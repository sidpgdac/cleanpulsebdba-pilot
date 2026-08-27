import { jwtVerify } from 'jose'

export function setupAuth(db, cleanerSecret) {
  async function verifySupervisor(req, reply) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.code(401).send({ error: 'Login required' })

    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) {
      return reply.code(401).send({ error: 'Invalid login' })
    }

    const { data: profile } = await db
      .from('profiles')
      .select('id,facility_id,role,full_name')
      .eq('id', data.user.id)
      .single()

    if (!profile) return reply.code(403).send({ error: 'Profile not configured' })

    req.profile = profile
  }

  async function verifyAdmin(req, reply) {
    await verifySupervisor(req, reply)
    // verifySupervisor sets req.profile on success
    if (req.profile && req.profile.role !== 'admin') {
      return reply.code(403).send({ error: 'Access Denied: Admin role required' })
    }
  }

  async function verifyCleaner(req, reply) {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
      const { payload } = await jwtVerify(token, cleanerSecret)
      if (payload.kind !== 'cleaner') throw new Error('Invalid cleaner token')
      req.cleaner = payload
    } catch {
      return reply.code(401).send({ error: 'Cleaner session expired. Scan QR again.' })
    }
  }

  function facilityAllowed(req, reply, facilityId) {
    if (
      req.profile.role !== 'admin' &&
      req.profile.facility_id !== facilityId
    ) {
      reply.code(403).send({ error: 'You cannot access another facility' })
      return false
    }
    return true
  }

  return { verifySupervisor, verifyAdmin, verifyCleaner, facilityAllowed }
}
