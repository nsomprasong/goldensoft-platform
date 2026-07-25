import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type AuthSessionUser = {
  id: string;
  email: string | null;
};

/**
 * Resolve the authenticated user.
 * In test mode (ALLOW_TEST_AUTH=1), accepts x-test-auth-user-id header.
 * Never trusts organization/role/permission headers from the client.
 */
export async function getAuthUser(options?: {
  testAuthUserId?: string | null;
  testEmail?: string | null;
}): Promise<AuthSessionUser | null> {
  if (
    process.env.ALLOW_TEST_AUTH === "1" &&
    options?.testAuthUserId &&
    options.testAuthUserId.length > 0
  ) {
    return {
      id: options.testAuthUserId,
      email: options.testEmail ?? `${options.testAuthUserId}@test.local`,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
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
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, cookieOptions);
          });
        } catch {
          // Server Components may not write cookies.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

export function readTestAuthFromHeaders(headers: Headers): {
  testAuthUserId: string | null;
  testEmail: string | null;
} {
  return {
    testAuthUserId: headers.get("x-test-auth-user-id"),
    testEmail: headers.get("x-test-auth-email"),
  };
}
