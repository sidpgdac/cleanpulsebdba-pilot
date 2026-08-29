import { supabase } from '../supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const CLEANER_JWT_SECRET = process.env.CLEANER_JWT_SECRET || 'insecure-dev-secret';
const CLEANER_JWT_EXPIRY = '15m'; // Short-lived token for the cleaning session

// Track failed PIN attempts per IP to enable soft lockout
const failedAttempts = new Map(); // ip -> { count, resetAt }
const MAX_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkLockout(ip) {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = failedAttempts.get(ip) || { count: 0, resetAt: now + LOCKOUT_WINDOW_MS };
  entry.count++;
  failedAttempts.set(ip, entry);
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

export default async function cleanerRoutes(app) {
  // ─── POST /api/cleaner/list ─────────────────────────────────────────────────
  // Returns active cleaners for a given toilet's facility.
  // Public endpoint — toilet code is the only identifier needed.
  app.post('/list', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        properties: {
          toilet_code: { type: 'string', minLength: 1, maxLength: 32 },
        },
        required: ['toilet_code'],
      },
    },
  }, async (req, reply) => {
    const { toilet_code } = req.body;

    // Get facility_id from toilet
    const { data: toilet, error: tErr } = await supabase
      .from('toilets')
      .select('facility_id')
      .eq('code', toilet_code.toUpperCase())
      .eq('active', true)
      .single();

    if (tErr || !toilet) {
      return reply.code(404).send({ error: 'Toilet not found' });
    }

    // Return active cleaners for that facility
    const { data: cleaners, error: cErr } = await supabase
      .from('cleaners')
      .select('id, full_name')
      .eq('facility_id', toilet.facility_id)
      .eq('active', true)
      .order('full_name');

    if (cErr) {
      return reply.code(500).send({ error: 'Failed to load cleaners' });
    }

    return reply.send({ cleaners: cleaners || [] });
  });

  // ─── POST /api/cleaner/start ────────────────────────────────────────────────
  // Verifies PIN with bcrypt; issues a short-lived cleaner JWT if correct;
  // starts the cleaning session in Supabase.
  app.post('/start', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, // Strict rate limit on PIN attempts
    schema: {
      body: {
        type: 'object',
        properties: {
          toilet_code: { type: 'string', minLength: 1, maxLength: 32 },
          cleaner_id: { type: 'string', format: 'uuid' },
          pin: { type: 'string', pattern: '^[0-9]{4}$' },
          idempotency_key: { type: 'string', minLength: 1, maxLength: 64 },
        },
        required: ['toilet_code', 'cleaner_id', 'pin', 'idempotency_key'],
      },
    },
  }, async (req, reply) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    // Check lockout
    if (checkLockout(clientIp)) {
      return reply.code(429).send({
        error: 'Too many failed PIN attempts. Try again in 5 minutes.',
      });
    }

    const { toilet_code, cleaner_id, pin, idempotency_key } = req.body;

    // Fetch the cleaner with their pin_hash using service role (bypasses RLS)
    const { data: cleaner, error: cErr } = await supabase
      .from('cleaners')
      .select('id, full_name, pin_hash, active, facility_id')
      .eq('id', cleaner_id)
      .single();

    if (cErr || !cleaner || !cleaner.active) {
      return reply.code(404).send({ error: 'Cleaner not found or inactive' });
    }

    // Verify PIN with bcrypt (compatible with pgcrypto blowfish hashes)
    const pinValid = await bcrypt.compare(pin, cleaner.pin_hash);
    if (!pinValid) {
      recordFailure(clientIp);
      return reply.code(401).send({ error: 'Incorrect PIN. Please try again.' });
    }

    // PIN correct — clear failure tracker
    clearFailures(clientIp);

    // Start the cleaning session via the Postgres RPC (handles toilet status update + idempotency)
    const { data: session, error: sErr } = await supabase.rpc('cleaner_start_session', {
      p_toilet_code: toilet_code.toUpperCase(),
      p_cleaner_id: cleaner_id,
      p_pin: pin, // RPC also verifies with pgcrypto — belt-and-suspenders
      p_idempotency_key: idempotency_key,
    });

    if (sErr) {
      const msg = sErr.message || '';
      if (msg.includes('not authorized')) return reply.code(403).send({ error: msg });
      if (msg.includes('already in progress')) return reply.code(409).send({ error: msg });
      if (msg.includes('Incorrect PIN')) {
        recordFailure(clientIp);
        return reply.code(401).send({ error: 'Incorrect PIN' });
      }
      return reply.code(500).send({ error: 'Failed to start session' });
    }

    // Issue a short-lived cleaner JWT so the complete step doesn't need the PIN again
    const cleanerToken = jwt.sign(
      {
        cleaner_id: cleaner.id,
        cleaner_name: cleaner.full_name,
        session_id: session.id,
        toilet_id: session.toilet_id,
        facility_id: session.facility_id,
      },
      CLEANER_JWT_SECRET,
      { expiresIn: CLEANER_JWT_EXPIRY }
    );

    return reply.send({
      session,
      cleaner_token: cleanerToken,
      cleaner_name: cleaner.full_name,
    });
  });

  // ─── POST /api/cleaner/complete ─────────────────────────────────────────────
  // Validates the cleaner JWT (not the PIN — no second bcrypt call needed);
  // completes the cleaning session.
  app.post('/complete', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        properties: {
          cleaner_token: { type: 'string' },
          site_photo_path: { type: 'string' },
          selfie_path: { type: 'string' },
          lat: { type: ['number', 'null'] },
          lng: { type: ['number', 'null'] },
          accuracy: { type: ['number', 'null'] },
        },
        required: ['cleaner_token', 'site_photo_path'],
      },
    },
  }, async (req, reply) => {
    const { cleaner_token, site_photo_path, selfie_path, lat, lng, accuracy } = req.body;

    // Validate the cleaner JWT
    let payload;
    try {
      payload = jwt.verify(cleaner_token, CLEANER_JWT_SECRET);
    } catch (err) {
      return reply.code(401).send({ error: 'Cleaner token is invalid or has expired. Please restart the cleaning process.' });
    }

    const { cleaner_id, session_id } = payload;

    // Verify the session is still in progress (double-check against DB)
    const { data: existingSession } = await supabase
      .from('cleaning_sessions')
      .select('id, status, cleaner_id')
      .eq('id', session_id)
      .single();

    if (!existingSession || existingSession.status !== 'IN_PROGRESS') {
      return reply.code(409).send({ error: 'Cleaning session is not active or was already completed' });
    }

    if (existingSession.cleaner_id !== cleaner_id) {
      return reply.code(403).send({ error: 'Unauthorized: session belongs to a different cleaner' });
    }

    // Complete the session — we use direct table update (service role) to avoid needing PIN again
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('cleaning_sessions')
      .update({
        status: 'COMPLETED',
        completed_at: now,
        site_photo_path,
        selfie_path: selfie_path || '',
        gps_lat: lat || null,
        gps_lng: lng || null,
        gps_accuracy: accuracy || null,
      })
      .eq('id', session_id);

    if (updateErr) {
      return reply.code(500).send({ error: 'Failed to complete session' });
    }

    // Update toilet status to CLEAN
    const { error: toiletErr } = await supabase
      .from('toilets')
      .update({
        status: 'CLEAN',
        last_cleaned_at: now,
        last_cleaner_id: cleaner_id,
      })
      .eq('id', existingSession.toilet_id ?? payload.toilet_id);

    if (toiletErr) {
      app.log.error({ err: toiletErr }, 'Failed to update toilet status after completing session');
    }

    // Resolve any open HOUSEKEEPING feedback for this toilet
    supabase
      .from('feedback')
      .update({ status: 'RESOLVED', resolved_at: now })
      .eq('toilet_id', payload.toilet_id)
      .eq('kind', 'HOUSEKEEPING')
      .eq('status', 'OPEN')
      .then(() => {})
      .catch(() => {});

    // Log the completion to audit_logs
    supabase.from('audit_logs').insert({
      facility_id: payload.facility_id,
      actor_id: cleaner_id,
      actor_type: 'CLEANER',
      action: 'SESSION_COMPLETED',
      entity_type: 'CLEANING_SESSION',
      entity_id: session_id,
      new_data: {
        completed_at: now,
        site_photo_path,
        gps_lat: lat,
        gps_lng: lng,
      },
    }).then(() => {}).catch(() => {});

    return reply.send({ ok: true, message: 'Cleaning session completed successfully' });
  });

  // ─── POST /api/cleaner/upload ───────────────────────────────────────────────
  // Accepts multipart photo upload; validates MIME type; stores in Supabase Storage.
  // Requires a valid cleaner_token query param.
  app.post('/upload', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const cleanerToken = req.query.token;

    if (!cleanerToken) {
      return reply.code(401).send({ error: 'Missing cleaner token' });
    }

    let payload;
    try {
      payload = jwt.verify(cleanerToken, CLEANER_JWT_SECRET);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired cleaner token' });
    }

    // Get the uploaded file
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    // Validate MIME type — only accept JPEG and PNG
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.code(400).send({
        error: 'Only JPEG, PNG, and WebP images are accepted',
        received: data.mimetype,
      });
    }

    const ext = data.mimetype.includes('png') ? 'png' : data.mimetype.includes('webp') ? 'webp' : 'jpg';
    const { facility_id, toilet_id, session_id } = payload;
    const storagePath = `${facility_id}/${toilet_id}/${session_id}/evidence-${Date.now()}.${ext}`;

    // Read the file buffer
    const chunks = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Validate file size (extra defence beyond Fastify multipart limit)
    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (fileBuffer.length > MAX_BYTES) {
      return reply.code(400).send({ error: 'File too large. Maximum size is 10 MB.' });
    }

    // Upload to Supabase Storage using service role (bypasses storage RLS)
    const { error: uploadErr } = await supabase.storage
      .from('cleaning-evidence')
      .upload(storagePath, fileBuffer, {
        contentType: data.mimetype,
        upsert: false,
      });

    if (uploadErr) {
      app.log.error({ err: uploadErr }, 'Storage upload failed');
      return reply.code(500).send({ error: 'Photo upload failed. Please try again.' });
    }

    return reply.send({ ok: true, path: storagePath });
  });
}
