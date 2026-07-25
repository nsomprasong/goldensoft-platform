import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { createSubscription } from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";
import type { BillingCycle } from "@prisma/client";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: {
      platformRoles: { where: { status: "ACTIVE" } },
      memberships: { where: { status: "ACTIVE" } },
    },
  });
  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 403 });
  }

  const isSuper = profile.platformRoles.some((r) => r.role === "SUPER_ADMIN");
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
    include: { product: true, plan: true, organization: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ subscriptions });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id },
    include: { platformRoles: { where: { status: "ACTIVE" } } },
  });
  const platformRoles = profile?.platformRoles.map((r) => r.role) ?? [];
  const perms = permissionsForRoles({ platformRoles, organizationRoles: [] });
  if (
    !platformRoles.includes("SUPER_ADMIN") &&
    !perms.includes(PLATFORM_PERMISSIONS.subscriptionManage)
  ) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    productCode?: string;
    planCode?: string;
    billingCycle?: BillingCycle;
    idempotencyKey?: string;
    limits?: Record<string, number | boolean | string>;
  };

  const idempotencyKey =
    body.idempotencyKey ?? request.headers.get("idempotency-key");

  if (
    !body.organizationId ||
    !body.productCode ||
    !body.planCode ||
    !body.billingCycle ||
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
      billingCycle: body.billingCycle,
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
