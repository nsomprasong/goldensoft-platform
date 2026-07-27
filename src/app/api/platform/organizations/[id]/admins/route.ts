import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { createStaffAuthAdapter } from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import {
  addOrganizationAdminContact,
  listOrganizationAdminContacts,
} from "@/lib/platform/organization-admins";
import {
  canManageOrganization,
  canViewOrganization,
  OrganizationAdminError,
} from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  const { id: organizationId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  if (!canViewOrganization(actor, organizationId)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
    );
  }

  const admins = await listOrganizationAdminContacts(prisma, organizationId);
  return NextResponse.json({
    ok: true,
    admins,
    canManage: canManageOrganization(actor, organizationId),
  });
}

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

  const { id: organizationId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json().catch(() => null);

  try {
    const result = await addOrganizationAdminContact(prisma, {
      actor,
      organizationId,
      payload: body,
      auth: createStaffAuthAdapter(),
    });
    return NextResponse.json(
      {
        ok: true,
        message: result.reused
          ? TH.org.adminAttachedSuccess
          : TH.org.adminAddedSuccess,
        ...result,
      },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          code: "VALIDATION",
          message: error.issues[0]?.message ?? TH.common.failed,
        },
        { status: 400 },
      );
    }
    throw error;
  }
}
