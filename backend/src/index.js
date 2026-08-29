import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { startStatusCron } from './jobs/status-cron.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8787;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// ─── Build Fastify ────────────────────────────────────────────────────────────
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
  trustProxy: true, // Required for rate-limit to use real client IP behind Railway/Render proxies
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

// CORS — allow the frontend origin + any Vercel preview URLs
await app.register(fastifyCors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Server-to-server or curl
    const allowed =
      origin === FRONTEND_ORIGIN ||
      /\.vercel\.app$/.test(origin) ||
      /localhost(:\d+)?$/.test(origin);
    cb(allowed ? null : new Error('Not allowed by CORS'), allowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Rate limit — sensible global defaults; individual routes can override
await app.register(fastifyRateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
  addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
  errorResponseBuilder: (_req, context) => ({
    error: 'Too many requests',
    limit: context.max,
    window: context.after,
  }),
});

// Multipart (for photo uploads)
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max per file
    files: 1,
  },
});

// Static files — serves the Marathi audio file and any other static assets
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'static'),
  prefix: '/static/',
  decorateReply: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
const { default: healthRoutes } = await import('./routes/health.js');
const { default: publicRoutes } = await import('./routes/public.js');
const { default: cleanerRoutes } = await import('./routes/cleaner.js');
const { default: adminRoutes } = await import('./routes/admin.js');

await app.register(healthRoutes);
await app.register(publicRoutes, { prefix: '/api/public' });
await app.register(cleanerRoutes, { prefix: '/api/cleaner' });
await app.register(adminRoutes, { prefix: '/api/admin' });

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const code = err.statusCode ?? 500;
  reply.code(code).send({ error: err.message || 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`CleanPulse backend running on port ${PORT}`);

    // Start background status advancement cron
    if (process.env.NODE_ENV !== 'test') {
      startStatusCron();
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  app.log.info(`${signal} received — shutting down gracefully`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export { app }; // exported for testing
