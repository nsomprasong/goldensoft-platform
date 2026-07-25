import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { MASTER } from "@/lib/platform/master-codes";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { createSubscription } from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId");
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
      memberships: { where: { statusId: membershipActive.id } },
    },
  });
  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 403 });
  }

  const isSuper = profile.platformRoles.some(
    (r) => r.role.code === MASTER.platformRole.SUPER_ADMIN,
  );
  const memberOrgIds = profile.memberships.map((m) => m.organizationId);

  if (organizationId && !isSuper && !memberOrgIds.includes(organizationId)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: organizationId
        ? organizationId
        : isSuper
          ? undefined
          : { in: memberOrgIds },
    },
    select: {
      id: true,
      organizationId: true,
      createdAt: true,
      snapshotJson: true,
      product: { select: { id: true, code: true, name: true } },
      plan: { select: { id: true, code: true, name: true } },
      organization: {
        select: { id: true, displayName: true, customerCode: true },
      },
      status: { select: { code: true } },
      billingCycle: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      createdAt: s.createdAt,
      snapshotJson: s.snapshotJson,
      product: s.product,
      plan: s.plan,
      organization: s.organization,
      status: s.status.code,
      billingCycle: s.billingCycle.code,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
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
  const perms = permissionsForRoles({ platformRoles, organizationRoles: [] });
  if (
    !platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !perms.includes(PLATFORM_PERMISSIONS.subscriptionManage)
  ) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    productCode?: string;
    planCode?: string;
    billingCycle?: string;
    billingCycleCode?: string;
    idempotencyKey?: string;
    limits?: Record<string, number | boolean | string>;
  };

  const idempotencyKey =
    body.idempotencyKey ?? request.headers.get("idempotency-key");
  const billingCycleCode = body.billingCycleCode ?? body.billingCycle;

  if (
    !body.organizationId ||
    !body.productCode ||
    !body.planCode ||
    !billingCycleCode ||
    !idempotencyKey
  ) {
    return NextResponse.json(
      { message: "Missing required fields or Idempotency-Key" },
      { status: 400 },
    );
  }

  try {
    const { reused, result } = await createSubscription(prisma, {
      organizationId: body.organizationId,
      productCode: body.productCode,
      planCode: body.planCode,
      billingCycleCode,
      actorAuthUserId: user.id,
      idempotencyKey,
      limits: body.limits,
    });
    return NextResponse.json({ reused, ...result }, { status: reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
