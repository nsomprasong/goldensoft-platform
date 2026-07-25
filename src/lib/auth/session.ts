import { cookies, headers } from "next/headers";
import { cache } from "react";

import { isTestAuthEnabled } from "@/lib/env/test-auth";
import { measure } from "@/lib/perf/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthSessionUser = {
  id: string;
  email: string | null;
};

/**
 * React cache() keeps this request-scoped: repeated calls inside one server
 * request reuse the same Supabase round trip, and nothing is shared between
 * requests or users. Keys are primitives so callers dedupe reliably.
 */
const resolveAuthUser = cache(
  async (
    testAuthUserId: string | null,
    testEmail: string | null,
  ): Promise<AuthSessionUser | null> => {
    if (isTestAuthEnabled() && testAuthUserId && testAuthUserId.length > 0) {
      return {
        id: testAuthUserId,
        email: testEmail ?? `${testAuthUserId}@test.local`,
      };
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ) {
      return null;
    }

    return measure("auth", async () => {
      // Ensure cookies() is available in request scope
      await cookies();
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email ?? null,
      };
    });
  },
);

/**
 * Resolve the authenticated user.
 * In test mode (ALLOW_TEST_AUTH=true), accepts x-test-auth-user-id header.
 * Never trusts organization/role/permission headers from the client.
 */
export async function getAuthUser(options?: {
  testAuthUserId?: string | null;
  testEmail?: string | null;
}): Promise<AuthSessionUser | null> {
  let testAuthUserId = options?.testAuthUserId ?? null;
  let testEmail = options?.testEmail ?? null;

  // When ALLOW_TEST_AUTH is on, also accept headers on RSC/pages (not only API).
  if (isTestAuthEnabled() && (testAuthUserId == null || testAuthUserId === "")) {
    try {
      const headerList = await headers();
      const fromHeaders = readTestAuthFromHeaders(headerList);
      if (fromHeaders.testAuthUserId) {
        testAuthUserId = fromHeaders.testAuthUserId;
        testEmail = testEmail ?? fromHeaders.testEmail;
      }
    } catch {
      // headers() is unavailable outside a request scope
    }
  }

  return resolveAuthUser(testAuthUserId, testEmail);
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
