// Supabase client with the PUBLIC ANON key — RLS restricts it to
// reading exercises only. Writes happen server-side in the bot backend.
// Created lazily so dev mock mode (?mock=...) runs without any .env.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    if (!url || !anonKey) {
      throw new Error(
        "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY " +
          "(put them in webapp/.env.local, or use dev mock mode: /?mock=matching)",
      );
    }
    client = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return client;
}
