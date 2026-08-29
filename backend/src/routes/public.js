import { supabase } from '../supabase.js';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function publicRoutes(app) {
  // ─── GET /api/public/toilets/:code ─────────────────────────────────────────
  // Returns toilet info for the QR scan landing page (public, no auth needed).
  // Also increments the scan counter in a fire-and-forget update.
  app.get('/toilets/:code', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      params: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
    },
  }, async (req, reply) => {
    const code = (req.params.code || '').toUpperCase();

    const { data: toilet, error } = await supabase
      .from('toilets')
      .select('id, code, name, building, floor, area, status, cleaning_interval_minutes, last_cleaned_at, facility_id, facilities(name)')
      .eq('code', code)
      .eq('active', true)
      .single();

    if (error || !toilet) {
      return reply.code(404).send({ error: `Toilet "${code}" not found or inactive` });
    }

    // Fire-and-forget QR scan tracking (non-blocking)
    (async () => {
      try {
        await supabase.rpc('increment_qr_scan', { p_toilet_code: code });
      } catch (e) {}
    })();

    return reply.send({
      ...toilet,
      facility_name: toilet.facilities?.name,
    });
  });

  // ─── POST /api/public/feedback ─────────────────────────────────────────────
  // Rate-limited citizen feedback submission.
  // Categories from data.js: 'Dirty toilet', 'Wet / slippery floor', etc.
  app.post('/feedback', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, // 30 reports/min per IP
    schema: {
      body: {
        type: 'object',
        properties: {
          toilet_code: { type: 'string', minLength: 1, maxLength: 32 },
          category: { type: 'string', minLength: 1, maxLength: 100 },
        },
        required: ['toilet_code', 'category'],
      },
    },
  }, async (req, reply) => {
    const { toilet_code, category } = req.body;

    const VALID_CATEGORIES = [
      'Dirty toilet', 'Wet / slippery floor', 'Bad smell', 'No soap',
      'No water', 'Bin full', 'Broken fixture', 'Blocked toilet',
    ];

    if (!VALID_CATEGORIES.includes(category)) {
      return reply.code(400).send({
        error: 'Invalid category',
        valid: VALID_CATEGORIES,
      });
    }

    const { error } = await supabase.rpc('submit_feedback', {
      p_toilet_code: toilet_code.toUpperCase(),
      p_category: category,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('not found')) {
        return reply.code(404).send({ error: 'Toilet not found' });
      }
      return reply.code(500).send({ error: 'Failed to submit feedback' });
    }

    return reply.send({ ok: true, message: 'Feedback submitted successfully' });
  });

  // ─── GET /api/public/audio/instructions ────────────────────────────────────
  // Serves the Marathi cleaning instructions MP3 file.
  app.get('/audio/instructions', {
    config: { rateLimit: { max: 200, timeWindow: '1 minute' } },
  }, async (_req, reply) => {
    const audioPath = join(__dirname, '..', '..', 'static', 'marathi_instructions.mp3');
    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'public, max-age=86400') // Cache for 24h
      .sendFile('marathi_instructions.mp3', join(__dirname, '..', '..', 'static'));
  });
}
