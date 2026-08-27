import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'

export default async function cleaningRoutes(app, options) {
  const { db, auth, cleanerSecret } = options
  const { verifyCleaner } = auth

  app.post('/login', {
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = z.object({
      toiletCode: z.string().min(3).max(40),
      cleanerId: z.string().uuid(),
      pin: z.string().regex(/^\d{4,8}$/)
    }).parse(req.body)

    const { data: toilet } = await db
      .from('toilets')
      .select('id,facility_id')
      .eq('code', body.toiletCode.toUpperCase())
      .eq('active', true)
      .single()

    const { data: cleaner } = await db
      .from('cleaners')
      .select('*')
      .eq('id', body.cleanerId)
      .single()

    if (
      !toilet ||
      !cleaner?.active ||
      cleaner.facility_id !== toilet.facility_id
    ) {
      return reply.code(403).send({
        error: 'Cleaner is not authorized for this hospital'
      })
    }

    const valid = await bcrypt.compare(body.pin, cleaner.pin_hash)

    if (!valid) {
      return reply.code(401).send({ error: 'Incorrect PIN' })
    }

    const token = await new SignJWT({
      kind: 'cleaner',
      cleanerId: cleaner.id,
      facilityId: cleaner.facility_id,
      cleanerName: cleaner.full_name
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(cleanerSecret)

    const { data: activeSession } = await db
      .from('cleaning_sessions')
      .select('*')
      .eq('toilet_id', toilet.id)
      .eq('cleaner_id', cleaner.id)
      .eq('status', 'IN_PROGRESS')
      .maybeSingle()

    return { token, activeSession }
  })

  app.post('/start', {
    preHandler: verifyCleaner
  }, async (req, reply) => {
    const body = z.object({
      toiletCode: z.string().min(3).max(40),
      idempotencyKey: z.string().min(8).max(100)
    }).parse(req.body)

    const { data: toilet } = await db
      .from('toilets')
      .select('id,facility_id')
      .eq('code', body.toiletCode.toUpperCase())
      .eq('active', true)
      .single()

    if (
      !toilet ||
      toilet.facility_id !== req.cleaner.facilityId
    ) {
      return reply.code(403).send({ error: 'Not authorized' })
    }

    const { data: existing } = await db
      .from('cleaning_sessions')
      .select('id,cleaner_id,status,started_at,cleaners(full_name)')
      .eq('toilet_id', toilet.id)
      .eq('status', 'IN_PROGRESS')
      .maybeSingle()

    if (existing) {
      if (existing.cleaner_id === req.cleaner.cleanerId) {
        return { data: existing }
      }
      return reply.code(409).send({
        error: `Cleaning already in progress by ${existing.cleaners?.full_name || 'another cleaner'}`
      })
    }

    const { data: session, error } = await db
      .from('cleaning_sessions')
      .insert({
        facility_id: toilet.facility_id,
        toilet_id: toilet.id,
        cleaner_id: req.cleaner.cleanerId,
        status: 'IN_PROGRESS',
        idempotency_key: body.idempotencyKey
      })
      .select()
      .single()

    if (error?.code === '23505') {
      return reply.code(409).send({
        error: 'Cleaning already in progress'
      })
    }
    if (error) throw error

    await db
      .from('toilets')
      .update({ status: 'CLEANING' })
      .eq('id', toilet.id)

    return { data: session }
  })

  app.post('/:id/upload-url', {
    preHandler: verifyCleaner
  }, async (req, reply) => {
    const body = z.object({
      kind: z.enum(['site', 'selfie']),
      contentType: z.string().max(100)
    }).parse(req.body)

    const { data: session } = await db
      .from('cleaning_sessions')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (
      !session ||
      session.cleaner_id !== req.cleaner.cleanerId ||
      session.status !== 'IN_PROGRESS'
    ) {
      return reply.code(403).send({ error: 'Invalid cleaning session' })
    }

    const ext = body.contentType.includes('png') ? 'png' : 'jpg'
    const path = `${session.facility_id}/${session.toilet_id}/${session.id}/${body.kind}-${crypto.randomUUID()}.${ext}`

    const { data, error } = await db.storage
      .from('cleaning-evidence')
      .createSignedUploadUrl(path)

    if (error) throw error

    return {
      path,
      token: data.token
    }
  })

  app.post('/:id/complete', {
    preHandler: verifyCleaner
  }, async (req, reply) => {
    const body = z.object({
      sitePhotoPath: z.string().min(5),
      selfiePath: z.string().min(5),
      gps: z.object({
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number()
      }).nullable().optional()
    }).parse(req.body)

    const { data: session } = await db
      .from('cleaning_sessions')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (
      !session ||
      session.cleaner_id !== req.cleaner.cleanerId ||
      session.status !== 'IN_PROGRESS'
    ) {
      return reply.code(409).send({ error: 'Cleaning is not active' })
    }

    const now = new Date().toISOString()

    await db
      .from('cleaning_sessions')
      .update({
        status: 'COMPLETED',
        completed_at: now,
        site_photo_path: body.sitePhotoPath,
        selfie_path: body.selfiePath,
        gps_lat: body.gps?.lat ?? null,
        gps_lng: body.gps?.lng ?? null,
        gps_accuracy: body.gps?.accuracy ?? null
      })
      .eq('id', session.id)
      .eq('status', 'IN_PROGRESS')

    await Promise.all([
      db
        .from('toilets')
        .update({
          status: 'CLEAN',
          last_cleaned_at: now,
          last_cleaner_id: session.cleaner_id
        })
        .eq('id', session.toilet_id),

      db
        .from('feedback')
        .update({
          status: 'RESOLVED',
          resolved_at: now
        })
        .eq('toilet_id', session.toilet_id)
        .eq('kind', 'HOUSEKEEPING')
        .eq('status', 'OPEN')
    ])

    return {
      ok: true,
      completedAt: now
    }
  })
}
