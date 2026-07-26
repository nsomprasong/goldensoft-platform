"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import { TH } from "@/lib/i18n/th";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COOKIE_NAME } from "@/lib/context/cookie";

export type LoginActionState = {
  error: string | null;
};

export async function signInWithPassword(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = resolvePostLoginRedirect(String(formData.get("next") ?? "/"));

  if (!email || !password) {
    return { error: TH.login.invalid };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: TH.login.invalid };
    }
  } catch {
    return { error: TH.common.connectionError };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // still clear local context cookie
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  revalidatePath("/", "layout");
  redirect("/login");
}
