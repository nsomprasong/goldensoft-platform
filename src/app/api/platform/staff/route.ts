import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import {
  createStaffAuthAdapter,
  StaffAuthError,
} from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import {
  createStaffMember,
  staffCreateSchema,
  StaffAdminError,
} from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

/** Create a GoldenSoft employee: Auth login + profile + platform roles. */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
    );
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
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

  const parsed = staffCreateSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        code: "INVALID_BODY",
        message: firstIssue?.message ?? TH.common.failed,
      },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  try {
    const created = await createStaffMember(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      auth: createStaffAuthAdapter(),
      payload: parsed.data,
    });
    return NextResponse.json(
      {
        ok: true,
        message: TH.staff.createSuccess,
        staff: {
          userProfileId: created.userProfileId,
          email: created.email,
          passwordResetExpiresAt: created.passwordReset?.expiresAt ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof StaffAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : 400;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    if (error instanceof StaffAuthError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: 502 },
      );
    }
    throw error;
  }
}
