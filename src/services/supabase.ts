import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// Ensure Supabase is configured
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Supabase admin client will not work.");
}

// Create a Supabase admin client using the service role key
// This bypasses RLS and should ONLY be used in secure backend routes
export const supabaseAdmin = createClient(
  env.SUPABASE_URL || "https://placeholder.supabase.co",
  env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
