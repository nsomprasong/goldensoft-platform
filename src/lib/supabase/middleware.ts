import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const REFRESH_WINDOW_MS = 120_000;

function isStaleRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code) : "";
  const message =
    "message" in error ? String((error as { message?: string }).message) : "";
  return (
    code === "refresh_token_not_found" ||
    /refresh token/i.test(message)
  );
}

/** Drop broken Auth cookies so login can start clean. */
async function clearLocalAuthSession(
  supabase: ReturnType<typeof createServerClient>,
) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Cookie write may still succeed via setAll; ignore secondary failures.
  }
}

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
    error: sessionError,
  } = await supabase.auth.getSession();

  if (isStaleRefreshTokenError(sessionError)) {
    await clearLocalAuthSession(supabase);
    return { response: supabaseResponse, user: null };
  }

  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const sessionFresh =
    Boolean(session?.user) && expiresAtMs - Date.now() > REFRESH_WINDOW_MS;

  // /login must not trust a local JWT alone — a stale refresh token here causes
  // Customer App SSO bounce (Platform thinks signed-in, App getUser fails).
  const isLoginPath = request.nextUrl.pathname.startsWith("/login");
  if (sessionFresh && session?.user && !isLoginPath) {
    return { response: supabaseResponse, user: session.user };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (isStaleRefreshTokenError(userError) || (!user && session?.refresh_token)) {
    await clearLocalAuthSession(supabase);
    return { response: supabaseResponse, user: null };
  }

  return { response: supabaseResponse, user };
}
