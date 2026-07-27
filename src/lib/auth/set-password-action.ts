"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateInvitePassword } from "@/lib/auth/accept-invite";
import {
  clearPasswordResetSession,
  loadPasswordResetFromSession,
} from "@/lib/auth/password-reset-session";
import { createStaffAuthAdapter } from "@/lib/auth/staff-auth-adapter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  acceptInvitationForAuthUser,
  UserInvitationError,
} from "@/lib/platform/user-invitations";
import {
  consumePasswordReset,
  StaffAdminError,
} from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

export type SetPasswordActionState = {
  error: string | null;
};

/**
 * Completes password setup from either:
 * 1) Supabase invite/recovery session (email link → /auth/set-password), or
 * 2) Administrator-opened reset cookie (empty-password login).
 */
export async function setPasswordAction(
  _prev: SetPasswordActionState,
  formData: FormData,
): Promise<SetPasswordActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const validationError = validateInvitePassword(password, confirmation);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return {
        error:
          error.message?.includes("session")
            ? "ลิงก์หมดอายุหรือถูกใช้แล้ว กรุณาขอคำเชิญใหม่"
            : `ตั้งรหัสผ่านไม่สำเร็จ: ${error.message}`,
      };
    }

    await finalizeAfterPasswordSet(user.id, password);
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/login?password=set");
  }

  // Cookie-based admin reset window (no Supabase session).
  const reset = await loadPasswordResetFromSession();
  if (!reset) {
    return { error: TH.setPassword.invalidTitle };
  }

  try {
    await consumePasswordReset(prisma, {
      auth: createStaffAuthAdapter(),
      resetId: reset.id,
      password,
    });
  } catch (error) {
    await clearPasswordResetSession();
    if (error instanceof StaffAdminError) {
      return { error: error.message };
    }
    return { error: TH.common.failed };
  }

  await clearPasswordResetSession();
  revalidatePath("/", "layout");
  redirect("/login?password=set");
}

async function finalizeAfterPasswordSet(
  authUserId: string,
  password: string,
): Promise<void> {
  const profile = await prisma.userProfile.findFirst({
    where: { authUserId, deletedAt: null },
    select: { id: true },
  });

  if (profile) {
    const openReset = await prisma.userPasswordReset.findFirst({
      where: {
        userProfileId: profile.id,
        consumedAt: null,
        cancelledAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { requestedAt: "desc" },
    });
    if (openReset) {
      try {
        await consumePasswordReset(prisma, {
          auth: createStaffAuthAdapter(),
          resetId: openReset.id,
          password,
        });
      } catch {
        // Password already applied via session updateUser — just close the row.
        await prisma.userPasswordReset.updateMany({
          where: {
            id: openReset.id,
            consumedAt: null,
            cancelledAt: null,
          },
          data: { consumedAt: new Date() },
        });
      }
    }
  }

  try {
    await acceptInvitationForAuthUser(prisma, authUserId);
  } catch (error) {
    if (
      error instanceof UserInvitationError &&
      error.code === "INVITE_NOT_READY"
    ) {
      // Staff accounts have no org invitation — expected.
      const staff = await prisma.platformRoleAssignment.findFirst({
        where: {
          userProfile: { authUserId, deletedAt: null },
          revokedAt: null,
          status: { code: MASTER.assignmentStatus.ACTIVE },
        },
        select: { id: true },
      });
      if (!staff && profile) {
        // Org invite incomplete — leave as soft success; user can contact admin.
      }
    }
  }

  await clearPasswordResetSession();
}
