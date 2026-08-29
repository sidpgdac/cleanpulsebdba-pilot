import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Set up environment variables before all imports
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
vi.stubEnv('CLEANER_JWT_SECRET', 'test-jwt-secret-for-cleaner-tests');
vi.stubEnv('NODE_ENV', 'test');

const TEST_PIN = '1234';
let TEST_PIN_HASH;

// vi.mock is hoisted, so we cannot reference a variable defined in the module scope.
// Use vi.hoisted() to create the mock objects before hoisting.
const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { mockSupabase };
});

vi.mock('../src/supabase.js', () => ({
  supabase: mockSupabase,
  getSupabaseUser: vi.fn(),
}));

import Fastify from 'fastify';
import { default as rateLimit } from '@fastify/rate-limit';
import { default as multipart } from '@fastify/multipart';
import cleanerRoutes from '../src/routes/cleaner.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: true, max: 9999, timeWindow: '1 minute' });
  await app.register(multipart);
  await app.register(cleanerRoutes, { prefix: '/api/cleaner' });
  await app.ready();
  return app;
}

describe('Cleaner Routes', () => {
  let app;

  beforeAll(async () => {
    TEST_PIN_HASH = await bcrypt.hash(TEST_PIN, 10);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /api/cleaner/list', () => {
    it('returns 404 for unknown toilet code', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/list',
        payload: { toilet_code: 'INVALID-T999' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/not found/i);
    });

    it('rejects missing toilet_code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/list',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns cleaners for a valid toilet code', async () => {
      // First call: toilet lookup
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { facility_id: 'fac-uuid' }, error: null }),
      });

      // Second call: cleaners query
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'c1', full_name: 'Meena' }],
          error: null,
        }),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/list',
        payload: { toilet_code: 'BDBA-T001' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('cleaners');
      expect(Array.isArray(body.cleaners)).toBe(true);
    });
  });

  describe('POST /api/cleaner/start — PIN verification', () => {
    it('returns 401 for incorrect PIN', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'cleaner-uuid',
            full_name: 'Meena',
            pin_hash: TEST_PIN_HASH,
            active: true,
            facility_id: 'fac-uuid',
          },
          error: null,
        }),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/start',
        payload: {
          toilet_code: 'BDBA-T001',
          cleaner_id: '00000000-0000-0000-0000-000000000001',
          pin: '0000', // Wrong PIN
          idempotency_key: 'test-key-wrong-pin',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/incorrect pin/i);
    });

    it('returns session and cleaner_token for correct PIN', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: '00000000-0000-0000-0000-000000000001',
            full_name: 'Meena',
            pin_hash: TEST_PIN_HASH,
            active: true,
            facility_id: 'fac-uuid',
          },
          error: null,
        }),
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          id: 'session-uuid',
          toilet_id: 'toilet-uuid',
          facility_id: 'fac-uuid',
          cleaner_id: '00000000-0000-0000-0000-000000000001',
          status: 'IN_PROGRESS',
          started_at: new Date().toISOString(),
        },
        error: null,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/start',
        payload: {
          toilet_code: 'BDBA-T001',
          cleaner_id: '00000000-0000-0000-0000-000000000001',
          pin: TEST_PIN, // Correct PIN
          idempotency_key: 'test-key-correct-pin',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('cleaner_token');
      expect(typeof body.cleaner_token).toBe('string');
      expect(body.cleaner_name).toBe('Meena');
    });

    it('rejects non-4-digit PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/start',
        payload: {
          toilet_code: 'BDBA-T001',
          cleaner_id: '00000000-0000-0000-0000-000000000001',
          pin: 'abc',
          idempotency_key: 'test-key-bad-pin-format',
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/cleaner/complete', () => {
    it('returns 401 for invalid cleaner_token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/complete',
        payload: {
          cleaner_token: 'invalid.token.here',
          site_photo_path: 'fac/toilet/session/photo.jpg',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('requires site_photo_path', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cleaner/complete',
        payload: {
          cleaner_token: 'some-token',
          // site_photo_path omitted
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
