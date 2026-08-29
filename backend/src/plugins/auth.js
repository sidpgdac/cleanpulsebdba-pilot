import fp from 'fastify-plugin';
import { getSupabaseUser, supabase } from '../supabase.js';

/**
 * Auth plugin — validates Supabase JWTs and attaches `req.user` + `req.profile`
 * to the request for use in admin route handlers.
 *
 * Usage: add `{ preHandler: app.authenticate }` to protected routes
 *        add `{ preHandler: app.requireAdmin }` to admin-only routes
 */
async function authPlugin(app) {
  // Decorate the request with user/profile (null by default)
  app.decorateRequest('user', null);
  app.decorateRequest('profile', null);

  /**
   * authenticate — validates JWT; attaches user + profile to request
   */
  app.decorate('authenticate', async function authenticate(req, reply) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    try {
      const user = await getSupabaseUser(token);
      req.user = user;

      // Load the profile row for role + facility_id
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, facility_id')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        return reply.code(403).send({ error: 'User profile not found — contact your administrator' });
      }

      req.profile = profile;
    } catch (err) {
      return reply.code(401).send({ error: 'Token is invalid or has expired' });
    }
  });

  /**
   * requireAdmin — must be chained after authenticate
   * Allows access only for profiles with role = 'admin'
   */
  app.decorate('requireAdmin', async function requireAdmin(req, reply) {
    if (!req.profile) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (req.profile.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  });

  /**
   * requireSupervisor — allows admins AND supervisors
   */
  app.decorate('requireSupervisor', async function requireSupervisor(req, reply) {
    if (!req.profile) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (!['admin', 'supervisor'].includes(req.profile.role)) {
      return reply.code(403).send({ error: 'Supervisor or Admin access required' });
    }
  });
}

export default fp(authPlugin, { name: 'auth', fastify: '5.x' });
