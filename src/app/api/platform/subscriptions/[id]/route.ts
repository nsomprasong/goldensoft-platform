import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  SubscriptionLifecycleError,
  getSubscription,
  listSubscriptionHistoryFromAudit,
} from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  try {
    const subscription = await getSubscription(prisma, id);
    const isSuper = actor.platformRoles.includes(
      MASTER.platformRole.SUPER_ADMIN,
    );
    if (
      !isSuper &&
      !actor.membershipOrganizationIds.includes(subscription.organizationId)
    ) {
      return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
    }
    const history = await listSubscriptionHistoryFromAudit(prisma, id);
    return NextResponse.json({
      subscription: {
        id: subscription.id,
        organizationId: subscription.organizationId,
        organization: subscription.organization,
        product: subscription.product,
        plan: subscription.plan,
        planVersion: {
          id: subscription.planVersion.id,
          versionNumber: subscription.planVersion.versionNumber,
          priceAmount: subscription.planVersion.priceAmount,
          currency: subscription.planVersion.currency,
          trialDays: subscription.planVersion.trialDays,
        },
        status: subscription.status.code,
        billingCycle: subscription.billingCycle.code,
        planCode: subscription.planCode,
        priceAmount: subscription.priceAmount,
        currency: subscription.currency,
        snapshotJson: subscription.snapshotJson,
        startsAt: subscription.startsAt,
        endsAt: subscription.endsAt,
        trialEndsAt: subscription.trialEndsAt,
        cancelledAt: subscription.cancelledAt,
        entitlements: subscription.entitlements.map((e) => ({
          id: e.id,
          code: e.code,
          nameTh: e.nameTh,
          limitValue: e.limitValue,
          status: e.status.code,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
        })),
      },
      history: history.map((h) => ({
        id: h.id,
        action: h.actionType.code,
        actionTh: h.actionType.nameTh,
        createdAt: h.createdAt,
        beforeJson: h.beforeJson,
        afterJson: h.afterJson,
      })),
    });
  } catch (error) {
    if (error instanceof SubscriptionLifecycleError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
