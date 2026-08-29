import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables before importing the app
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
vi.stubEnv('CLEANER_JWT_SECRET', 'test-jwt-secret');
vi.stubEnv('NODE_ENV', 'test');

// Mock the supabase module
vi.mock('../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
      catch: vi.fn(),
    })),
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
  getSupabaseUser: vi.fn(),
}));

import Fastify from 'fastify';
import healthRoutes from '../src/routes/health.js';

describe('Health Endpoint', () => {
  let app;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Register rate-limit with a very high limit for tests
    const { default: rateLimit } = await import('@fastify/rate-limit');
    await app.register(rateLimit, { global: true, max: 9999, timeWindow: '1 minute' });

    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('cleanpulse-backend');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe('number');
  });
});
