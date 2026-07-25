import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  PlanAdminError,
  createPlan,
  listPlans,
} from "@/lib/platform/plans-admin";
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
    const result = await listPlans(prisma, actor, {
      productId: url.searchParams.get("productId") ?? undefined,
      statusCode: url.searchParams.get("status") ?? undefined,
      skip: (page - 1) * take,
      take,
    });
    return NextResponse.json({
      total: result.total,
      page,
      pageSize: take,
      plans: result.rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        status: p.status.code,
        product: p.product,
        latestVersion: p.versions[0]
          ? {
              versionNumber: p.versions[0].versionNumber,
              priceAmount: p.versions[0].priceAmount,
              currency: p.versions[0].currency,
              status: p.versions[0].status.code,
              billingCycle: p.versions[0].billingCycleDefault.code,
            }
          : null,
        subscriptionCount: p._count.subscriptions,
      })),
    });
  } catch (error) {
    if (error instanceof PlanAdminError) {
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
  try {
    const body = await request.json();
    const created = await createPlan(prisma, actor, body);
    return NextResponse.json(
      {
        message: TH.common.saved,
        plan: { id: created.plan.id, code: created.plan.code },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "CODE_DUPLICATE"
            ? 409
            : 400;
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status },
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
