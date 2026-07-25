import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

async function assertOrgAccess(authUserId: string, organizationId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId },
    include: {
      platformRoles: { where: { status: "ACTIVE" } },
      memberships: {
        where: { organizationId, status: "ACTIVE" },
      },
    },
  });
  if (!profile) return false;
  if (profile.platformRoles.some((r) => r.role === "SUPER_ADMIN")) return true;
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
      const created = await tx.branch.create({
        data: {
          organizationId: id,
          code: body.code!,
          name: body.name!,
          timezone: body.timezone ?? "Asia/Bangkok",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: id,
          actorAuthUserId: user.id,
          action: "branch.create",
          entityType: "Branch",
          entityId: created.id,
          afterJson: JSON.stringify(created),
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
