import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { assertOrganizationEntitlement } from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizationId: z.string().uuid(),
  productCode: z.string().min(2),
  entitlementCode: z.string().min(2),
  branchId: z.string().uuid().optional().nullable(),
});

/**
 * Product-facing entitlement check. Auth required; never trusts client claims
 * about access — always re-reads entitlements server-side.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  if (
    !isSuper &&
    !actor.membershipOrganizationIds.includes(parsed.data.organizationId)
  ) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
    );
  }

  const result = await assertOrganizationEntitlement({
    db: prisma,
    organizationId: parsed.data.organizationId,
    productCode: parsed.data.productCode,
    entitlementCode: parsed.data.entitlementCode,
    branchId: parsed.data.branchId,
  });

  return NextResponse.json({
    allowed: result.allowed,
    value: result.value,
    reason: result.reason,
    subscriptionStatus: result.subscriptionStatus,
    expiresAt: result.expiresAt,
    organizationId: parsed.data.organizationId,
    productCode: parsed.data.productCode,
    entitlementCode: parsed.data.entitlementCode,
    branchId: parsed.data.branchId ?? null,
  });
}
