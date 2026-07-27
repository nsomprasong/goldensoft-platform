import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  staffUpdateSchema,
  StaffAdminError,
  updateStaffMember,
} from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

/** Update an employee's display name and account status. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const parsed = staffUpdateSchema.safeParse(body);
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

  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const updated = await updateStaffMember(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      userProfileId: id,
      payload: parsed.data,
    });
    return NextResponse.json({
      ok: true,
      message: TH.staff.updateSuccess,
      staff: { id: updated.id, displayName: updated.displayName },
    });
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
    throw error;
  }
}
