const VERSION = '1.0.0';

export default async function healthRoutes(app) {
  app.get('/health', {
    config: { rateLimit: { max: 500, timeWindow: '1 minute' } }, // Health checks need higher limits
  }, async (_req, reply) => {
    reply.send({
      status: 'ok',
      version: VERSION,
      service: 'cleanpulse-backend',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    });
  });
}
