import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { beginPasswordResetSessionById } from "@/lib/auth/password-reset-session";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { SET_PASSWORD_PATH } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  passwordResetId: z.string().uuid(),
});

/**
 * Operator opens the set-password screen for a newly provisioned user
 * (invite-send disabled / phone-only path).
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  if (!actor.profileId) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }

  const reset = await beginPasswordResetSessionById(parsed.data.passwordResetId);
  if (!reset) {
    return NextResponse.json(
      { message: "ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่พบ", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    setPasswordPath: SET_PASSWORD_PATH,
    email: reset.email,
    expiresAt: reset.expiresAt.toISOString(),
  });
}
