import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { regenerateEntitlementsForSubscription } from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import {
  SubscriptionLifecycleError,
  activateSubscription,
  cancelSubscription,
  changePlan,
  expireSubscription,
  extendSubscriptionEndDate,
  resumeSubscription,
  suspendSubscription,
} from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  const body = (await request.json()) as {
    action?: string;
    planCode?: string;
    billingCycleCode?: string;
    endsAt?: string;
    idempotencyKey?: string;
  };

  try {
    switch (body.action) {
      case "activate":
        await activateSubscription(prisma, actor, id);
        break;
      case "suspend":
        await suspendSubscription(prisma, actor, id);
        break;
      case "resume":
        await resumeSubscription(prisma, actor, id);
        break;
      case "cancel":
        await cancelSubscription(prisma, actor, id);
        break;
      case "expire":
        await expireSubscription(prisma, actor, id);
        break;
      case "extend": {
        if (!body.endsAt) {
          return NextResponse.json(
            { message: "ต้องระบุวันสิ้นสุด" },
            { status: 400 },
          );
        }
        await extendSubscriptionEndDate(prisma, actor, {
          subscriptionId: id,
          endsAt: new Date(body.endsAt),
        });
        break;
      }
      case "change_plan": {
        if (!body.planCode) {
          return NextResponse.json(
            { message: "ต้องระบุแพ็กเกจใหม่" },
            { status: 400 },
          );
        }
        const key =
          body.idempotencyKey ??
          request.headers.get("idempotency-key") ??
          `change-plan:${id}:${body.planCode}:${Date.now()}`;
        await changePlan(prisma, actor, {
          subscriptionId: id,
          planCode: body.planCode,
          billingCycleCode: body.billingCycleCode,
          idempotencyKey: key,
        });
        break;
      }
      case "regenerate_entitlements": {
        if (!actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
          return NextResponse.json(
            { message: TH.common.forbidden },
            { status: 403 },
          );
        }
        await regenerateEntitlementsForSubscription(prisma, {
          subscriptionId: id,
          actorAuthUserId: user.id,
        });
        break;
      }
      default:
        return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.saved });
  } catch (error) {
    if (error instanceof SubscriptionLifecycleError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        {
          status:
            error.code === "FORBIDDEN"
              ? 403
              : error.code === "NOT_FOUND"
                ? 404
                : 400,
        },
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : TH.common.failed },
      { status: 400 },
    );
  }
}
