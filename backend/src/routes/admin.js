import { z } from 'zod'
import QRCode from 'qrcode'

export default async function adminRoutes(app, options) {
  const { db, auth } = options
  const { verifyAdmin, facilityAllowed } = auth

  app.addHook('preHandler', verifyAdmin)

  // Facilities
  app.get('/facilities', async (req, reply) => {
    const { data, error } = await db.from('facilities').select('*').order('name')
    if (error) throw error
    return { data }
  })

  app.post('/facilities', async (req, reply) => {
    const body = z.object({
      code: z.string().min(2).max(20).toUpperCase(),
      name: z.string().min(2).max(100),
      active: z.boolean().default(true)
    }).parse(req.body)

    const { data, error } = await db.from('facilities').insert(body).select().single()
    
    if (error?.code === '23505') {
      return reply.code(409).send({ error: 'Facility code already exists' })
    }
    if (error) throw error

    return { data }
  })

  // Toilets
  app.post('/toilets', async (req, reply) => {
    const body = z.object({
      facilityId: z.string().uuid(),
      building: z.string().optional().nullable(),
      floor: z.string().optional().nullable(),
      area: z.string().optional().nullable(),
      name: z.string().min(2).max(100),
      toiletType: z.string().optional().nullable(),
      numUnits: z.number().int().min(0).max(100),
      cleaningIntervalMinutes: z.number().int().min(10)
    }).parse(req.body)

    const publicAppUrl = process.env.PUBLIC_APP_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

    const { data, error } = await db.rpc('create_toilet_with_qr', {
      p_facility_id: body.facilityId,
      p_building: body.building || null,
      p_floor: body.floor || null,
      p_area: body.area || null,
      p_name: body.name,
      p_toilet_type: body.toiletType || null,
      p_num_units: body.numUnits,
      p_cleaning_interval_minutes: body.cleaningIntervalMinutes,
      p_actor_id: req.profile.id,
      p_public_app_url: publicAppUrl
    })

    if (error) throw error

    return { data }
  })

  // QR Centre
  app.get('/qr', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    let query = db
      .from('qr_codes')
      .select('*, toilets(*), facilities(name)')
      .order('created_at', { ascending: false })
      
    if (facilityId) {
      query = query.eq('facility_id', facilityId)
    }

    const { data, error } = await query
    if (error) throw error

    if (data && data.length > 0) {
      const toiletIds = data.map(q => q.toilet_id)
      const { data: units } = await db.from('toilet_units').select('toilet_id').in('toilet_id', toiletIds)
      const unitCounts = {}
      if (units) {
        units.forEach(u => {
          unitCounts[u.toilet_id] = (unitCounts[u.toilet_id] || 0) + 1
        })
      }
      data.forEach(q => {
        q.internal_units_count = unitCounts[q.toilet_id] || 0
      })
    }

    return { data }
  })

  app.get('/qr/:toiletId/png', async (req, reply) => {
    const toiletId = z.string().uuid().parse(req.params.toiletId)
    
    const { data: qr } = await db.from('qr_codes').select('target_url, qr_code, toilets(name)').eq('toilet_id', toiletId).eq('status', 'ACTIVE').single()
    
    if (!qr) return reply.code(404).send({ error: 'QR Code not found or inactive' })
    
    try {
      const pngBuffer = await QRCode.toBuffer(qr.target_url, {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 4,
        scale: 10
      })
      
      const safeName = `${qr.qr_code}-${qr.toilets?.name || 'Toilet'}`.replace(/[^a-z0-9]/gi, '_')
      reply.header('Content-Type', 'image/png')
      reply.header('Content-Disposition', `attachment; filename="${safeName}.png"`)
      return reply.send(pngBuffer)
    } catch (e) {
      return reply.code(500).send({ error: 'Failed to generate PNG' })
    }
  })

  // --- NEW ROUTES FOR EXTENDED UI ---

  // Admin toilets list
  app.get('/toilets', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    let query = db.from('supervisor_toilet_view').select('*').order('code')
    if (facilityId) query = query.eq('facility_id', facilityId)
    
    const { data, error } = await query
    if (error) throw error
    return { data }
  })

  // Units
  app.get('/units', async (req, reply) => {
    const toiletId = z.string().uuid().parse(req.query.toiletId)
    const { data, error } = await db.from('toilet_units').select('*').eq('toilet_id', toiletId).order('unit_code')
    if (error) throw error
    return { data }
  })

  app.post('/units', async (req, reply) => {
    const body = z.object({
      toiletId: z.string().uuid(),
      unitType: z.string().default('Western WC')
    }).parse(req.body)

    const { data, error } = await db.from('toilet_units').insert({
      toilet_id: body.toiletId,
      unit_type: body.unitType,
      operational: true
    }).select().single()
    if (error) throw error
    return { data }
  })

  app.patch('/units/:id', async (req, reply) => {
    const id = z.string().uuid().parse(req.params.id)
    const body = z.object({
      operational: z.boolean()
    }).parse(req.body)

    const { data, error } = await db.from('toilet_units')
      .update({ operational: body.operational, issue: body.operational ? null : 'Marked unavailable' })
      .eq('id', id)
      .select().single()
    
    if (error) throw error
    return { data }
  })

  // Feedback
  app.get('/feedback', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    // Join with toilets to get name and code
    let query = db.from('feedback')
      .select('*, toilets!inner(name, code, facility_id)')
      .order('created_at', { ascending: false })
      
    if (facilityId) query = query.eq('toilets.facility_id', facilityId)

    const { data, error } = await query
    if (error) throw error

    // Flatten for frontend
    const flat = (data || []).map(f => ({
      ...f,
      toilet_name: f.toilets?.name,
      toilet_code: f.toilets?.code
    }))
    
    return { data: flat }
  })

  app.patch('/feedback/:id', async (req, reply) => {
    const id = z.string().uuid().parse(req.params.id)
    const body = z.object({ status: z.string() }).parse(req.body)

    const { data, error } = await db.from('feedback')
      .update({ status: body.status })
      .eq('id', id)
      .select().single()
    
    if (error) throw error
    return { data }
  })

  // Cleaning sessions
  app.get('/cleaning-sessions', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    let query = db.from('cleaning_sessions')
      .select('*, toilets!inner(name, code, facility_id), cleaners(full_name)')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100)

    if (facilityId) query = query.eq('toilets.facility_id', facilityId)

    const { data, error } = await query
    if (error) throw error

    const flat = (data || []).map(s => ({
      ...s,
      toilet_name: s.toilets?.name,
      toilet_code: s.toilets?.code,
      cleaner_name: s.cleaners?.full_name
    }))
    
    return { data: flat }
  })

  // Cleaners
  app.get('/cleaners', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    let query = db.from('cleaners').select('*').order('full_name')
    if (facilityId) query = query.eq('facility_id', facilityId)

    const { data, error } = await query
    if (error) throw error

    const formatted = (data || []).map(c => ({
      ...c,
      name: c.full_name,
      status: 'active'
    }))
    return { data: formatted }
  })

  // Users
  app.get('/users', async (req, reply) => {
    const facilityId = req.query.facilityId
    if (facilityId) {
      z.string().uuid().parse(facilityId)
      if (!facilityAllowed(req, reply, facilityId)) return
    }

    let query = db.from('profiles').select('*').order('full_name')
    if (facilityId) query = query.eq('facility_id', facilityId)

    const { data, error } = await query
    if (error) throw error
    return { data }
  })

  // QR Patch
  app.patch('/qr/:id', async (req, reply) => {
    const id = z.string().uuid().parse(req.params.id)
    const body = z.object({ status: z.string() }).parse(req.body)

    const { data, error } = await db.from('qr_codes')
      .update({ status: body.status })
      .eq('id', id)
      .select().single()
    
    if (error) throw error
    return { data }
  })
}
