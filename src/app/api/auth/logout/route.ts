import { NextResponse } from "next/server";

import { COOKIE_NAME, contextCookieOptions } from "@/lib/context/cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore — still clear context cookie
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    ...contextCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
