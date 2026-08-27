import { z } from 'zod'

export default async function supervisorRoutes(app, options) {
  const { db, auth } = options
  const { verifySupervisor, facilityAllowed } = auth

  app.addHook('preHandler', verifySupervisor)

  app.get('/toilets', async (req, reply) => {
    const facilityId = z.string().uuid().parse(req.query.facilityId)

    if (!facilityAllowed(req, reply, facilityId)) return

    const { data, error } = await db
      .from('supervisor_toilet_view')
      .select('*')
      .eq('facility_id', facilityId)
      .order('attention_minutes', { ascending: false })

    if (error) throw error

    return { data }
  })

  app.get('/overview', async (req, reply) => {
    const facilityId = z.string().uuid().parse(req.query.facilityId)

    if (!facilityAllowed(req, reply, facilityId)) return

    const { data, error } = await db
      .from('supervisor_toilet_view')
      .select('derived_status,open_complaints')
      .eq('facility_id', facilityId)

    if (error) throw error

    const result = {
      not_cleaned: 0,
      overdue: 0,
      cleaning_now: 0,
      clean: 0,
      maintenance: 0,
      open_complaints: 0
    }

    for (const toilet of data || []) {
      if (['NOT_CLEANED', 'NEEDS_CLEANING'].includes(toilet.derived_status)) result.not_cleaned++
      if (toilet.derived_status === 'OVERDUE') result.overdue++
      if (toilet.derived_status === 'CLEANING') result.cleaning_now++
      if (toilet.derived_status === 'CLEAN') result.clean++
      if (toilet.derived_status === 'MAINTENANCE') result.maintenance++
      result.open_complaints += Number(toilet.open_complaints || 0)
    }

    result.action_required =
      result.not_cleaned +
      result.overdue +
      result.maintenance

    return { data: result }
  })
}
