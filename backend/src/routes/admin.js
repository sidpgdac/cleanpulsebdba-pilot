import { supabase } from '../supabase.js';
import authPlugin from '../plugins/auth.js';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12; // Good balance of security and performance

export default async function adminRoutes(app) {
  // Register auth plugin for this scope
  await app.register(authPlugin);

  // All routes in this plugin require authentication
  app.addHook('preHandler', app.authenticate);

  // ════════════════════════════════════════════════════════════════════════════
  // FACILITIES
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/facilities — list all facilities (admin sees all, supervisor sees theirs)
  app.get('/facilities', {
    preHandler: [app.requireSupervisor],
  }, async (req, reply) => {
    let query = supabase.from('facilities').select('*').order('name');

    // Supervisors can only see their own facility
    if (req.profile.role === 'supervisor' && req.profile.facility_id) {
      query = query.eq('id', req.profile.facility_id);
    }

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Failed to fetch facilities' });

    return reply.send({ facilities: data || [] });
  });

  // POST /api/admin/facilities — create a new facility
  app.post('/facilities', {
    preHandler: [app.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 200 },
          code: { type: 'string', minLength: 2, maxLength: 10, pattern: '^[A-Z]+$' },
        },
        required: ['name', 'code'],
      },
    },
  }, async (req, reply) => {
    const { name, code } = req.body;

    const { data: facility, error } = await supabase
      .from('facilities')
      .insert({ name, code: code.toUpperCase() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return reply.code(409).send({ error: `Facility code "${code}" already exists` });
      }
      return reply.code(500).send({ error: 'Failed to create facility' });
    }

    // Audit log
    supabase.from('audit_logs').insert({
      facility_id: facility.id,
      actor_id: req.user.id,
      actor_type: 'USER',
      action: 'FACILITY_CREATED',
      entity_type: 'FACILITY',
      entity_id: facility.id,
      new_data: { name, code },
    }).then(() => {}).catch(() => {});

    return reply.code(201).send({ facility });
  });

  // PATCH /api/admin/facilities/:id — update facility name or active status
  app.patch('/facilities/:id', {
    preHandler: [app.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 200 },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.active !== undefined) updates.active = req.body.active;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('facilities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to update facility' });
    if (!data) return reply.code(404).send({ error: 'Facility not found' });

    return reply.send({ facility: data });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TOILETS
  // ════════════════════════════════════════════════════════════════════════════

  // POST /api/admin/toilets — create a toilet with QR code (atomic RPC)
  app.post('/toilets', {
    preHandler: [app.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 2, maxLength: 200 },
          building: { type: 'string', maxLength: 100 },
          floor: { type: 'string', maxLength: 100 },
          area: { type: 'string', maxLength: 100 },
          toilet_type: { type: 'string', nullable: true },
          num_units: { type: 'integer', minimum: 0, maximum: 100 },
          cleaning_interval_minutes: { type: 'integer', minimum: 10, maximum: 1440 },
        },
        required: ['facility_id', 'name'],
      },
    },
  }, async (req, reply) => {
    const {
      facility_id,
      name,
      building = 'Main',
      floor = 'Ground Floor',
      area = 'General',
      toilet_type = null,
      num_units = 4,
      cleaning_interval_minutes = 120,
    } = req.body;

    const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

    const { data, error } = await supabase.rpc('create_toilet_with_qr', {
      p_facility_id: facility_id,
      p_building: building,
      p_floor: floor,
      p_area: area,
      p_name: name,
      p_toilet_type: toilet_type,
      p_num_units: num_units,
      p_cleaning_interval_minutes: cleaning_interval_minutes,
      p_actor_id: req.user.id,
      p_public_app_url: PUBLIC_APP_URL,
    });

    if (error) {
      if (error.message?.includes('Facility not found')) {
        return reply.code(404).send({ error: 'Facility not found' });
      }
      return reply.code(500).send({ error: 'Failed to create toilet' });
    }

    return reply.code(201).send({ toilet: data });
  });

  // PATCH /api/admin/toilets/:id — update toilet metadata
  app.patch('/toilets/:id', {
    preHandler: [app.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 200 },
          building: { type: 'string', maxLength: 100 },
          floor: { type: 'string', maxLength: 100 },
          area: { type: 'string', maxLength: 100 },
          cleaning_interval_minutes: { type: 'integer', minimum: 10 },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const allowed = ['name', 'building', 'floor', 'area', 'cleaning_interval_minutes', 'active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('toilets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to update toilet' });
    if (!data) return reply.code(404).send({ error: 'Toilet not found' });

    return reply.send({ toilet: data });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CLEANERS
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/cleaners — list cleaners for a facility
  app.get('/cleaners', {
    preHandler: [app.requireSupervisor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          active: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (req, reply) => {
    const facilityId = req.query.facility_id || req.profile.facility_id;
    if (!facilityId) {
      return reply.code(400).send({ error: 'facility_id is required' });
    }

    let query = supabase
      .from('cleaners')
      .select('id, full_name, active, created_at')
      .eq('facility_id', facilityId)
      .order('full_name');

    if (req.query.active !== undefined) {
      query = query.eq('active', req.query.active === 'true');
    }

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Failed to fetch cleaners' });

    return reply.send({ cleaners: data || [] });
  });

  // POST /api/admin/cleaners — create a cleaner (hashes PIN server-side)
  app.post('/cleaners', {
    preHandler: [app.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          full_name: { type: 'string', minLength: 2, maxLength: 200 },
          pin: { type: 'string', pattern: '^[0-9]{4}$' },
        },
        required: ['facility_id', 'full_name', 'pin'],
      },
    },
  }, async (req, reply) => {
    const { facility_id, full_name, pin } = req.body;

    // Hash the PIN server-side — never store raw PINs
    const pin_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    const { data: cleaner, error } = await supabase
      .from('cleaners')
      .insert({ facility_id, full_name, pin_hash, active: true })
      .select('id, full_name, active, created_at')
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to create cleaner' });

    // Audit log
    supabase.from('audit_logs').insert({
      facility_id,
      actor_id: req.user.id,
      actor_type: 'USER',
      action: 'CLEANER_CREATED',
      entity_type: 'CLEANER',
      entity_id: cleaner.id,
      new_data: { full_name },
    }).then(() => {}).catch(() => {});

    return reply.code(201).send({ cleaner });
  });

  // PATCH /api/admin/cleaners/:id — update cleaner name, status, or reset PIN
  app.patch('/cleaners/:id', {
    preHandler: [app.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          full_name: { type: 'string', minLength: 2, maxLength: 200 },
          active: { type: 'boolean' },
          new_pin: { type: 'string', pattern: '^[0-9]{4}$' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const updates = {};

    if (req.body.full_name !== undefined) updates.full_name = req.body.full_name;
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.new_pin !== undefined) {
      updates.pin_hash = await bcrypt.hash(req.body.new_pin, BCRYPT_ROUNDS);
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('cleaners')
      .update(updates)
      .eq('id', id)
      .select('id, full_name, active')
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to update cleaner' });
    if (!data) return reply.code(404).send({ error: 'Cleaner not found' });

    return reply.send({ cleaner: data });
  });

  // DELETE /api/admin/cleaners/:id — deactivate cleaner (soft delete)
  app.delete('/cleaners/:id', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const { id } = req.params;

    const { error } = await supabase
      .from('cleaners')
      .update({ active: false })
      .eq('id', id);

    if (error) return reply.code(500).send({ error: 'Failed to deactivate cleaner' });

    return reply.send({ ok: true, message: 'Cleaner deactivated' });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CLEANING SESSIONS
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/sessions — paginated cleaning sessions
  app.get('/sessions', {
    preHandler: [app.requireSupervisor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
        },
      },
    },
  }, async (req, reply) => {
    const facilityId = req.query.facility_id || req.profile.facility_id;
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;

    let query = supabase
      .from('cleaning_sessions')
      .select(`
        id, status, started_at, completed_at, site_photo_path,
        gps_lat, gps_lng,
        toilets!inner(id, code, name, floor, area),
        cleaners!inner(id, full_name)
      `, { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (facilityId) query = query.eq('facility_id', facilityId);
    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Failed to fetch sessions' });

    return reply.send({ sessions: data || [], total: count ?? 0, limit, offset });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // COMPLAINTS / FEEDBACK
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/complaints — paginated complaints
  app.get('/complaints', {
    preHandler: [app.requireSupervisor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['OPEN', 'RESOLVED'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const facilityId = req.query.facility_id || req.profile.facility_id;
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;

    let query = supabase
      .from('feedback')
      .select('id, kind, category, status, created_at, resolved_at, toilets!inner(id, code, name, floor, area)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (facilityId) query = query.eq('facility_id', facilityId);
    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Failed to fetch complaints' });

    return reply.send({ complaints: data || [], total: count ?? 0 });
  });

  // PATCH /api/admin/complaints/:id — resolve a complaint
  app.patch('/complaints/:id', {
    preHandler: [app.requireSupervisor],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['RESOLVED'] } },
        required: ['status'],
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('feedback')
      .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to update complaint' });
    if (!data) return reply.code(404).send({ error: 'Complaint not found' });

    return reply.send({ complaint: data });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/analytics — computed KPIs for the dashboard
  app.get('/analytics', {
    preHandler: [app.requireSupervisor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (req, reply) => {
    const facilityId = req.query.facility_id || req.profile.facility_id;
    const days = req.query.days || 7;
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

    if (!facilityId) {
      return reply.code(400).send({ error: 'facility_id is required' });
    }

    // Run queries in parallel
    const [toiletsResult, sessionsResult, feedbackResult] = await Promise.all([
      supabase
        .from('toilets')
        .select('id, status, last_cleaned_at, cleaning_interval_minutes')
        .eq('facility_id', facilityId)
        .eq('active', true),

      supabase
        .from('cleaning_sessions')
        .select('id, started_at, completed_at, status')
        .eq('facility_id', facilityId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', since),

      supabase
        .from('feedback')
        .select('id, status, created_at, resolved_at, kind')
        .eq('facility_id', facilityId)
        .gte('created_at', since),
    ]);

    const toilets = toiletsResult.data || [];
    const sessions = sessionsResult.data || [];
    const feedback = feedbackResult.data || [];

    // Compute KPIs
    const total = toilets.length;
    const clean = toilets.filter(t => t.status === 'CLEAN').length;
    const uptime_pct = total > 0 ? Math.round((clean / total) * 100 * 10) / 10 : 0;

    // Average session duration
    const completedWithDuration = sessions.filter(s => s.started_at && s.completed_at);
    const avg_session_minutes = completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((sum, s) => {
            return sum + (new Date(s.completed_at) - new Date(s.started_at)) / 60000;
          }, 0) / completedWithDuration.length
        )
      : 0;

    // SLA compliance — sessions completed within 30 minutes of start
    const withinSla = completedWithDuration.filter(s =>
      (new Date(s.completed_at) - new Date(s.started_at)) / 60000 <= 30
    ).length;
    const sla_compliance = completedWithDuration.length > 0
      ? Math.round((withinSla / completedWithDuration.length) * 100)
      : 100;

    // Average feedback resolution time (hours)
    const resolvedFeedback = feedback.filter(f => f.status === 'RESOLVED' && f.resolved_at);
    const avg_resolution_hours = resolvedFeedback.length > 0
      ? Math.round(
          resolvedFeedback.reduce((sum, f) => {
            return sum + (new Date(f.resolved_at) - new Date(f.created_at)) / 3600000;
          }, 0) / resolvedFeedback.length * 10
        ) / 10
      : 0;

    return reply.send({
      period_days: days,
      facility_id: facilityId,
      toilets: {
        total,
        clean,
        not_cleaned: toilets.filter(t => ['NOT_CLEANED', 'NEEDS_CLEANING'].includes(t.status)).length,
        overdue: toilets.filter(t => t.status === 'OVERDUE').length,
        cleaning: toilets.filter(t => t.status === 'CLEANING').length,
        maintenance: toilets.filter(t => t.status === 'MAINTENANCE').length,
        uptime_pct,
      },
      sessions: {
        total: sessions.length,
        avg_duration_minutes: avg_session_minutes,
        sla_compliance_pct: sla_compliance,
      },
      feedback: {
        total: feedback.length,
        open: feedback.filter(f => f.status === 'OPEN').length,
        resolved: resolvedFeedback.length,
        avg_resolution_hours,
        housekeeping: feedback.filter(f => f.kind === 'HOUSEKEEPING').length,
        maintenance: feedback.filter(f => f.kind === 'MAINTENANCE').length,
      },
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/audit-logs', {
    preHandler: [app.requireSupervisor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          facility_id: { type: 'string', format: 'uuid' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const facilityId = req.query.facility_id || req.profile.facility_id;
    const limit = req.query.limit || 50;
    const offset = req.query.offset || 0;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Failed to fetch audit logs' });

    return reply.send({ logs: data || [], total: count ?? 0 });
  });
}
