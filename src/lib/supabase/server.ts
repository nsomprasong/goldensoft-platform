import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { withAuthCookieDomain } from "@/lib/auth/cookie-domain";

/** Browser-safe publishable key only. */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public configuration is missing");
  }

  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>,
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Domain cookies only here — host-only twins are cleared via
            // middleware expireHostOnlyCookie (raw Set-Cookie append).
            cookieStore.set(name, value, withAuthCookieDomain(options));
          });
        } catch {
          // Server Components may not write cookies.
        }
      },
    },
  });
}
