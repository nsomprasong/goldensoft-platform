import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the secret key.
 * Never import this module from Client Components or browser bundles.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("Supabase server configuration is missing");
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
