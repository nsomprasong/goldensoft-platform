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
  cancelOrganizationAdminPasswordReset,
  requestOrganizationAdminPasswordReset,
} from "@/lib/platform/organization-admins";
import { OrganizationAdminError } from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string; profileId: string }>;
};

const cancelSchema = z.object({
  resetId: z.string().uuid(),
});

function errorResponse(error: unknown): NextResponse {
  if (error instanceof OrganizationAdminError) {
    const status =
      error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
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

/** Open first-login / recovery set-password window for an org ADMIN/OWNER. */
export async function POST(request: NextRequest, context: RouteContext) {
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

  const { id: organizationId, profileId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);

  try {
    const reset = await requestOrganizationAdminPasswordReset(prisma, {
      actor,
      organizationId,
      userProfileId: profileId,
      auth: createStaffAuthAdapter(),
    });
    return NextResponse.json(
      {
        ok: true,
        message: TH.org.adminPasswordResetSuccess,
        reset: { id: reset.id, expiresAt: reset.expiresAt },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

  const body = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const { id: organizationId, profileId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);

  try {
    await cancelOrganizationAdminPasswordReset(prisma, {
      actor,
      organizationId,
      userProfileId: profileId,
      resetId: parsed.data.resetId,
    });
    return NextResponse.json({
      ok: true,
      message: TH.org.adminPasswordResetCancelSuccess,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
