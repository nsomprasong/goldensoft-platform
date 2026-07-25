import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  SubscriptionLifecycleError,
  createSubscription,
  listSubscriptionsForActor,
} from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const url = request.nextUrl;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const take = 50;
    const result = await listSubscriptionsForActor(prisma, actor, {
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      statusCode: url.searchParams.get("status") ?? undefined,
      skip: (page - 1) * take,
      take,
    });
    return NextResponse.json({
      total: result.total,
      page,
      pageSize: take,
      subscriptions: result.rows.map((s) => ({
        id: s.id,
        organizationId: s.organizationId,
        organization: s.organization,
        product: s.product,
        plan: s.plan,
        status: s.status.code,
        billingCycle: s.billingCycle.code,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof SubscriptionLifecycleError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  if (!isSuper) {
    // Org admins with subscriptionManage can create for their orgs
    const { permissionsForRoles, PLATFORM_PERMISSIONS } = await import(
      "@/lib/permissions/codes"
    );
    const perms = permissionsForRoles({
      platformRoles: actor.platformRoles,
      organizationRoles: actor.organizationRoles,
    });
    if (!perms.includes(PLATFORM_PERMISSIONS.subscriptionManage)) {
      return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
    }
  }

  const body = (await request.json()) as {
    organizationId?: string;
    productCode?: string;
    planCode?: string;
    billingCycle?: string;
    billingCycleCode?: string;
    statusCode?: string;
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
      { message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบ" },
      { status: 400 },
    );
  }

  if (
    !isSuper &&
    !actor.membershipOrganizationIds.includes(body.organizationId)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  try {
    const { reused, result } = await createSubscription(prisma, {
      organizationId: body.organizationId,
      productCode: body.productCode,
      planCode: body.planCode,
      billingCycleCode,
      statusCode: body.statusCode,
      actorAuthUserId: user.id,
      idempotencyKey,
      limits: body.limits,
    });
    return NextResponse.json(
      { message: TH.common.saved, reused, ...result },
      { status: reused ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof SubscriptionLifecycleError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "CONFLICT" ? 409 : 400 },
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : TH.common.failed },
      { status: 400 },
    );
  }
}
