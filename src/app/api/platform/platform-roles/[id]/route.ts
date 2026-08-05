import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import {
  PlatformRoleAssignError,
  PlatformRoleError,
  updatePlatformRole,
} from "@/lib/platform/platform-roles";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  description: z.string().max(500).optional().nullable(),
  permissionCodes: z.array(z.string().min(3)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await requireAuthUser(_request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  const permissions = await resolveActorPermissionCodes(prisma, {
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  });
  if (!permissions.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.access.deniedBody },
      { status: 403 },
    );
  }
  const { id } = await params;
  const role = await prisma.platformRole.findUnique({
    where: { id },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: {
          permission: {
            select: {
              code: true,
              nameTh: true,
              descriptionTh: true,
            },
          },
        },
      },
    },
  });
  if (!role) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: TH.common.notFound },
      { status: 404 },
    );
  }
  return NextResponse.json({ role });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const role = await updatePlatformRole(prisma, {
      actor: { platformRoles: actor.platformRoles },
      actorAuthUserId: user.id,
      roleId: id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, role });
  } catch (error) {
    if (
      error instanceof PlatformRoleError ||
      error instanceof PlatformRoleAssignError
    ) {
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
    console.error("updatePlatformRole failed", error);
    return NextResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "บันทึกบทบาทแพลตฟอร์มไม่สำเร็จ กรุณาลองใหม่",
      },
      { status: 500 },
    );
  }
}
