import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import {
  createStaffAuthAdapter,
  StaffAuthError,
} from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import {
  cancelPasswordReset,
  requestPasswordReset,
  StaffAdminError,
} from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

const cancelSchema = z.object({
  resetId: z.string().uuid(),
});

function errorResponse(error: unknown): NextResponse {
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

/**
 * Open a reset window: the current password stops working immediately and the
 * user sets a new one by signing in with an empty password.
 */
export async function POST(
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

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const reset = await requestPasswordReset(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      auth: createStaffAuthAdapter(),
      userProfileId: id,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json(
      {
        ok: true,
        message: TH.staff.passwordResetSuccess,
        reset: { id: reset.id, expiresAt: reset.expiresAt },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Cancel an open reset window (e.g. opened by mistake). */
export async function DELETE(
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
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  try {
    await cancelPasswordReset(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      userProfileId: id,
      resetId: parsed.data.resetId,
    });
    return NextResponse.json({
      ok: true,
      message: TH.staff.passwordResetCancelSuccess,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
