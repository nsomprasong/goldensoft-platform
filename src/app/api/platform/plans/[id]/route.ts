import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PlanAdminError,
  duplicatePlanVersion,
  getPlan,
  setPlanStatus,
  updatePlan,
} from "@/lib/platform/plans-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !perms.includes(PLATFORM_PERMISSIONS.planRead)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const plan = await getPlan(prisma, id);
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof PlanAdminError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  try {
    const body = await request.json();
    const plan = await updatePlan(prisma, actor, id, body);
    return NextResponse.json({ message: TH.common.saved, plan: { id: plan.id } });
  } catch (error) {
    if (error instanceof PlanAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  const body = (await request.json()) as {
    action?: string;
    basePrice?: number;
    currency?: string;
    trialDays?: number;
    billingCycleCode?: string;
    publish?: boolean;
  };
  try {
    if (body.action === "activate") {
      await setPlanStatus(prisma, actor, id, MASTER.planStatus.ACTIVE);
    } else if (body.action === "deactivate") {
      await setPlanStatus(prisma, actor, id, MASTER.planStatus.RETIRED);
    } else if (body.action === "duplicate") {
      await duplicatePlanVersion(prisma, actor, id, body);
    } else {
      return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.saved });
  } catch (error) {
    if (error instanceof PlanAdminError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? TH.common.failed },
        { status: 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
