// Supabase client using the SERVICE-ROLE key.
// Backend-only: it bypasses RLS so the bot can insert exercises and read
// student submissions. This key must never reach the webapp bundle.
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
