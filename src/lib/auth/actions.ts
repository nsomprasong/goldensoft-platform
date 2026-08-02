"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SET_PASSWORD_PATH } from "@/lib/auth/access";
import {
  isGoldenSoftPlatformStaff,
  resolveCustomerAppEntryUrl,
} from "@/lib/auth/customer-app-redirect";
import {
  loadPlatformUserBundle,
  type PlatformUserBundle,
} from "@/lib/auth/platform-user";
import { startPasswordResetSession } from "@/lib/auth/password-reset-session";
import {
  resolvePostLoginRedirect,
  resolveStaffPostLoginPath,
} from "@/lib/auth/post-login-redirect";
import { TH } from "@/lib/i18n/th";
import {
  isPhoneLoginEnabled,
  resolveAuthEmailForPhoneLogin,
  toE164ThaiMobile,
} from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COOKIE_NAME,
  contextCookieOptions,
} from "@/lib/context/cookie";

export type LoginActionState = {
  error: string | null;
  message?: string | null;
};

/**
 * Platform staff → Platform Admin. Org customers → Customer App (by package).
 */
async function resolveLoginDestination(
  bundle: PlatformUserBundle,
  requestedNext: string,
): Promise<string> {
  if (isGoldenSoftPlatformStaff(bundle.platformRoles)) {
    return resolveStaffPostLoginPath(requestedNext, {
      platformRoles: bundle.platformRoles,
      organizationRoles: bundle.memberships.flatMap((m) => m.roles),
    });
  }

  const customerUrl = await resolveCustomerAppEntryUrl(prisma, {
    memberships: bundle.memberships,
    preferredNext: requestedNext,
  });
  if (customerUrl) return customerUrl;

  // Customer App not configured — do not drop them into Platform Admin.
  return "/access?reason=customer_app";
}

export async function signInWithPassword(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = resolvePostLoginRedirect(String(formData.get("next") ?? "/"));

  if (!email) {
    return { error: TH.login.invalid };
  }

  // Empty password = first-time / admin-opened password setup window.
  if (!password) {
    let opened = false;
    try {
      opened = (await startPasswordResetSession(email)) !== null;
    } catch {
      return { error: TH.common.connectionError };
    }
    if (!opened) {
      return { error: TH.login.invalid };
    }
    redirect(SET_PASSWORD_PATH);
  }

  let destination = next;
  try {
    const supabase = await createSupabaseServerClient();
    // Stale refresh cookies (revoked / rotated) break getSession — clear locally first.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      return { error: TH.login.invalid };
    }
    const bundle = await loadPlatformUserBundle(data.user.id);
    destination = await resolveLoginDestination(bundle, next);
  } catch {
    return { error: TH.common.connectionError };
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signInWithPhonePassword(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (!(await isPhoneLoginEnabled(prisma))) {
    return { error: TH.login.phoneDisabled };
  }

  const phone = toE164ThaiMobile(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = resolvePostLoginRedirect(String(formData.get("next") ?? "/"));

  if (!phone) {
    return { error: TH.login.invalidPhone };
  }

  // Empty password = first-time setup (same cookie flow as email).
  if (!password) {
    let opened = false;
    try {
      const email = await resolveAuthEmailForPhoneLogin(prisma, phone);
      opened = (await startPasswordResetSession(email ?? phone)) !== null;
    } catch {
      return { error: TH.common.connectionError };
    }
    if (!opened) {
      return { error: TH.login.invalidPhone };
    }
    redirect(SET_PASSWORD_PATH);
  }

  let destination = next;
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

    // 1) Prefer native phone credential when Auth already has the phone.
    let signedIn = await supabase.auth.signInWithPassword({
      phone,
      password,
    });

    // 2) Email-first accounts: map phone → profile email, then password login.
    if (signedIn.error || !signedIn.data.user) {
      const email = await resolveAuthEmailForPhoneLogin(prisma, phone);
      if (!email) {
        return { error: TH.login.invalidPhone };
      }
      signedIn = await supabase.auth.signInWithPassword({
        email,
        password,
      });
    }

    if (signedIn.error || !signedIn.data.user) {
      return { error: TH.login.invalidPhone };
    }

    const bundle = await loadPlatformUserBundle(signedIn.data.user.id);
    destination = await resolveLoginDestination(bundle, next);
  } catch {
    return { error: TH.common.connectionError };
  }

  revalidatePath("/", "layout");
  redirect(destination);
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
    ...contextCookieOptions(0),
  });

  revalidatePath("/", "layout");
  redirect("/login");
}
