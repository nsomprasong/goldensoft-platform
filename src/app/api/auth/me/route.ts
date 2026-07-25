import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }

  const assignmentActive = await prisma.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const membershipActive = await prisma.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  if (!assignmentActive || !membershipActive) {
    return NextResponse.json(
      { message: "Master data incomplete" },
      { status: 503 },
    );
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: {
      status: true,
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      preference: true,
      memberships: {
        where: { statusId: membershipActive.id },
        include: {
          organization: true,
          roles: {
            where: { statusId: assignmentActive.id },
            include: { role: true },
          },
        },
      },
    },
  });

  if (!profile || profile.status.code !== MASTER.userProfileStatus.ACTIVE) {
    return NextResponse.json(
      { message: "User profile not configured", code: "PROFILE_NOT_FOUND" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    authUserId: profile.authUserId,
    email: profile.email,
    displayName: profile.displayName,
    platformRoles: profile.platformRoles.map((r) => r.role.code),
    preference: profile.preference,
    memberships: profile.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.displayName,
      roles: m.roles.map((r) => r.role.code),
    })),
  });
}
