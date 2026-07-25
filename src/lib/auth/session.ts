import { cookies } from "next/headers";

import { isTestAuthEnabled } from "@/lib/env/test-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthSessionUser = {
  id: string;
  email: string | null;
};

/**
 * Resolve the authenticated user.
 * In test mode (ALLOW_TEST_AUTH=true), accepts x-test-auth-user-id header.
 * Never trusts organization/role/permission headers from the client.
 */
export async function getAuthUser(options?: {
  testAuthUserId?: string | null;
  testEmail?: string | null;
}): Promise<AuthSessionUser | null> {
  if (
    isTestAuthEnabled() &&
    options?.testAuthUserId &&
    options.testAuthUserId.length > 0
  ) {
    return {
      id: options.testAuthUserId,
      email: options.testEmail ?? `${options.testAuthUserId}@test.local`,
    };
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }

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
