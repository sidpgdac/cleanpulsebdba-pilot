import { z } from 'zod'

export default async function publicRoutes(app, options) {
  const { db } = options

  app.get('/toilets/:code', async (req, reply) => {
    const code = String(req.params.code || '').trim().toUpperCase()

    const { data: toilet } = await db
      .from('toilets')
      .select('id,facility_id,code,name,building,floor,area,status,last_cleaned_at,facilities(name)')
      .eq('code', code)
      .eq('active', true)
      .single()

    if (!toilet) return reply.code(404).send({ error: 'Toilet not found' })

    const { data: cleaners } = await db
      .from('cleaners')
      .select('id,full_name')
      .eq('facility_id', toilet.facility_id)
      .eq('active', true)
      .order('full_name')

    return {
      data: {
        ...toilet,
        facility_name: toilet.facilities?.name,
        cleaners: cleaners || [],
        derived_status: toilet.status
      }
    }
  })

  app.post('/feedback', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = z.object({
      toiletCode: z.string().min(3).max(40),
      category: z.string().min(2).max(80)
    }).parse(req.body)

    const { data: toilet } = await db
      .from('toilets')
      .select('id,facility_id')
      .eq('code', body.toiletCode.toUpperCase())
      .eq('active', true)
      .single()

    if (!toilet) return reply.code(404).send({ error: 'Toilet not found' })

    const isMaintenance = ['No water', 'Broken item', 'Broken flush', 'Blocked toilet'].includes(body.category)

    await db.from('feedback').insert({
      facility_id: toilet.facility_id,
      toilet_id: toilet.id,
      kind: isMaintenance ? 'MAINTENANCE' : 'HOUSEKEEPING',
      category: body.category,
      status: 'OPEN'
    })

    await db
      .from('toilets')
      .update({
        status: isMaintenance ? 'MAINTENANCE' : 'NEEDS_CLEANING'
      })
      .eq('id', toilet.id)

    return { ok: true }
  })

  app.post('/qr-scan', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = z.object({
      toiletCode: z.string().min(3).max(40)
    }).parse(req.body)

    // Non-blocking scan tracking
    db.rpc('increment_qr_scan', { p_toilet_code: body.toiletCode.toUpperCase() })
      .then(({ error }) => {
        if (error) req.log.error('QR Scan tracking failed:', error)
      })

    return { ok: true }
  })
}
