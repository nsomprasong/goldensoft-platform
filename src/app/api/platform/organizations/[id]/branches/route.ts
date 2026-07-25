import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

async function assertOrgAccess(authUserId: string, organizationId: string) {
  const assignmentActive = await prisma.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const membershipActive = await prisma.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  if (!assignmentActive || !membershipActive) return false;

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId },
    include: {
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      memberships: {
        where: { organizationId, statusId: membershipActive.id },
      },
    },
  });
  if (!profile) return false;
  if (
    profile.platformRoles.some(
      (r) => r.role.code === MASTER.platformRole.SUPER_ADMIN,
    )
  ) {
    return true;
  }
  return profile.memberships.length > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await assertOrgAccess(user.id, id))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const branches = await prisma.branch.findMany({
    where: { organizationId: id, deletedAt: null },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({ branches });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await assertOrgAccess(user.id, id))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    timezone?: string;
  };

  if (!body.code || !body.name) {
    return NextResponse.json({ message: "code and name required" }, { status: 400 });
  }

  try {
    const branch = await prisma.$transaction(async (tx) => {
      const statusId = await requireActiveMasterId(
        tx,
        "branchStatus",
        MASTER.branchStatus.ACTIVE,
      );
      const actionTypeId = await requireActiveMasterId(
        tx,
        "auditActionType",
        MASTER.auditActionType.BRANCH_CREATE,
      );
      const created = await tx.branch.create({
        data: {
          organizationId: id,
          code: body.code!,
          name: body.name!,
          timezone: body.timezone ?? "Asia/Bangkok",
          statusId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: id,
          actorAuthUserId: user.id,
          actionTypeId,
          entityType: "Branch",
          entityId: created.id,
          afterJson: {
            id: created.id,
            code: created.code,
            name: created.name,
            organizationId: created.organizationId,
          },
        },
      });
      return created;
    });

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
