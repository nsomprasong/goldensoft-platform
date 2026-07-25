import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  CustomRoleError,
  updateCustomRole,
} from "@/lib/platform/custom-roles";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  nameTh: z.string().min(1).max(120).optional(),
  nameEn: z.string().min(1).max(120).optional(),
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
  const { id } = await params;
  const role = await prisma.organizationRole.findUnique({
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
              resource: true,
              isActive: true,
            },
          },
        },
      },
      assignments: {
        where: { revokedAt: null },
        take: 50,
        select: {
          id: true,
          membership: {
            select: {
              userProfile: {
                select: { id: true, displayName: true, email: true },
              },
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
    const role = await updateCustomRole(prisma, {
      actor,
      actorAuthUserId: user.id,
      roleId: id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, role });
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
