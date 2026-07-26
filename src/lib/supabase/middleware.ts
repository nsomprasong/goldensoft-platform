import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const REFRESH_WINDOW_MS = 120_000;

/** Refresh Supabase Auth session cookies on the edge (read/write response cookies). */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return { response: supabaseResponse, user: null as null };
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>,
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Fast path: trust a non-expiring-soon session locally. getUser() hits Auth
  // over the network and dominated page latency when called on every request.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const sessionFresh =
    Boolean(session?.user) && expiresAtMs - Date.now() > REFRESH_WINDOW_MS;

  if (sessionFresh && session?.user) {
    return { response: supabaseResponse, user: session.user };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
