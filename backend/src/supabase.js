import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.\n' +
    'Copy backend/.env.example to backend/.env and fill in your Supabase credentials.'
  );
}

/**
 * Service-role Supabase client.
 * This bypasses Row Level Security and should ONLY be used server-side.
 * NEVER expose the service role key in frontend code.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Validate a Supabase user JWT and return the auth user.
 * Used by the admin auth plugin.
 * @param {string} token - The JWT from the Authorization header
 */
export async function getSupabaseUser(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error('Invalid or expired token');
  }
  return data.user;
}
