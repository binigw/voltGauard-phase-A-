import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase auth client — invite-only dashboard authentication.
 *
 * Only the PROJECT URL and the PUBLIC anon key are used here. Both are
 * safe to ship to the browser by design (data access is governed by
 * Row Level Security. The same signed-in session is attached to protected
 * Sigmo V2 user requests and is revalidated by Render with a DB-backed
 * role check. The service-role key must NEVER appear in frontend code.
 *
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set in the hosting
 * environment (Vercel). When they are absent the app degrades
 * honestly: the login page explains that sign-in is not configured
 * instead of throwing a cryptic error, and the route guard stays
 * closed (fail-closed — no dashboard access without a session).
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const isSupabaseAuthConfigured =
  /^https?:\/\//.test(supabaseUrl) && supabaseAnonKey.length > 20;

let client: SupabaseClient | null = null;

/** Lazily-created singleton. Throws a descriptive error when unset. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseAuthConfigured) {
    throw new Error(
      "Supabase auth is not configured: set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_ANON_KEY in the hosting environment and redeploy.",
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
