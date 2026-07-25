import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { MASTER } from "@/lib/platform/master-codes";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { bootstrapOrganization } from "@/lib/platform/organization-bootstrap";
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
    return NextResponse.json({ message: "Master data incomplete" }, { status: 503 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: {
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      memberships: {
        where: { statusId: membershipActive.id },
        include: { organization: { include: { status: true } } },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 403 });
  }

  const isSuper = profile.platformRoles.some(
    (r) => r.role.code === MASTER.platformRole.SUPER_ADMIN,
  );
  const orgs = isSuper
    ? await prisma.organization.findMany({
        where: { deletedAt: null },
        include: { status: true },
        orderBy: { displayName: "asc" },
      })
    : profile.memberships.map((m) => m.organization);

  return NextResponse.json({
    organizations: orgs.map((o) => ({
      ...o,
      status: o.status.code,
    })),
  });
}

export async function POST(request: NextRequest) {
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
  if (!assignmentActive) {
    return NextResponse.json({ message: "Master data incomplete" }, { status: 503 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: {
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
    },
  });

  const platformRoles = profile?.platformRoles.map((r) => r.role.code) ?? [];
  const perms = permissionsForRoles({
    platformRoles,
    organizationRoles: [],
  });

  if (
    !platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !perms.includes(PLATFORM_PERMISSIONS.organizationManage)
  ) {
    return NextResponse.json(
      { message: "Insufficient permissions" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    customerCode?: string;
    slug?: string;
    legalName?: string;
    displayName?: string;
    ownerAuthUserId?: string;
    ownerEmail?: string;
    ownerDisplayName?: string;
    initialBranch?: { code: string; name: string } | null;
    idempotencyKey?: string;
  };

  if (!body.customerCode || !body.slug || !body.legalName || !body.displayName) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  const idempotencyKey =
    body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json(
      { message: "Idempotency-Key required" },
      { status: 400 },
    );
  }

  try {
    const { reused, result } = await bootstrapOrganization(prisma, {
      customerCode: body.customerCode,
      slug: body.slug,
      legalName: body.legalName,
      displayName: body.displayName,
      ownerAuthUserId: body.ownerAuthUserId ?? user.id,
      ownerEmail: body.ownerEmail ?? user.email ?? `${user.id}@users.local`,
      ownerDisplayName: body.ownerDisplayName ?? body.displayName,
      initialBranch: body.initialBranch ?? {
        code: "HQ",
        name: "Headquarters",
      },
      idempotencyKey,
      actorAuthUserId: user.id,
    });

    return NextResponse.json({ reused, ...result }, { status: reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Bootstrap failed",
      },
      { status: 400 },
    );
  }
}
