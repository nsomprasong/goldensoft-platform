import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { validateInvitePassword } from "@/lib/auth/accept-invite";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import {
  clearPasswordResetSession,
  readPasswordResetSession,
} from "@/lib/auth/password-reset-session";
import {
  createStaffAuthAdapter,
  StaffAuthError,
} from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import { consumePasswordReset, StaffAdminError } from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  password: z.string().min(8).max(200),
  confirmation: z.string().min(8).max(200),
});

/**
 * Completes an administrator-initiated reset. Authorisation comes from the
 * signed reset cookie handed out by the empty-password sign-in, not a session.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  const session = await readPasswordResetSession();
  if (!session) {
    return NextResponse.json(
      { code: "RESET_EXPIRED", message: TH.setPassword.invalidTitle },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }
  const validationError = validateInvitePassword(
    parsed.data.password,
    parsed.data.confirmation,
  );
  if (validationError) {
    return NextResponse.json(
      { code: "INVALID_PASSWORD", message: validationError },
      { status: 400 },
    );
  }

  try {
    await consumePasswordReset(prisma, {
      auth: createStaffAuthAdapter(),
      resetId: session.resetId,
      password: parsed.data.password,
    });
  } catch (error) {
    if (error instanceof StaffAdminError) {
      await clearPasswordResetSession();
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.code === "EXPIRED" ? 410 : 400 },
      );
    }
    if (error instanceof StaffAuthError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: 502 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }

  await clearPasswordResetSession();
  return NextResponse.json({ ok: true, message: TH.login.passwordSetSuccess });
}
