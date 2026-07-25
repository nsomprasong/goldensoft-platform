import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  createCustomRole,
  CustomRoleError,
  listOrganizationRoles,
} from "@/lib/platform/custom-roles";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(2).max(48),
  nameTh: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  permissionCodes: z.array(z.string().min(3)).min(1),
});

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { code: "INVALID_QUERY", message: TH.common.failed },
      { status: 400 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  const roles = await listOrganizationRoles(prisma, organizationId);
  const visible =
    actor.platformRoles.includes("SUPER_ADMIN") ||
    actor.membershipOrganizationIds.includes(organizationId)
      ? roles
      : [];
  return NextResponse.json({ roles: visible });
}

export async function POST(request: NextRequest) {
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  try {
    const role = await createCustomRole(prisma, {
      actor,
      actorAuthUserId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, role }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomRoleError) {
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
    throw error;
  }
}
