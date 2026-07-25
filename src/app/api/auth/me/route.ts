import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: {
      platformRoles: { where: { status: "ACTIVE" } },
      preference: true,
      memberships: {
        where: { status: "ACTIVE" },
        include: {
          organization: true,
          roles: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (!profile || profile.status !== "ACTIVE") {
    return NextResponse.json(
      { message: "User profile not configured", code: "PROFILE_NOT_FOUND" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    authUserId: profile.authUserId,
    email: profile.email,
    displayName: profile.displayName,
    platformRoles: profile.platformRoles.map((r) => r.role),
    preference: profile.preference,
    memberships: profile.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.displayName,
      roles: m.roles.map((r) => r.role),
    })),
  });
}
