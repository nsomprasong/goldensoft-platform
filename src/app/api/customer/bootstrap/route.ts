import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  COOKIE_NAME,
  decodeContextCookie,
} from "@/lib/context/cookie";
import { TH } from "@/lib/i18n/th";
import { resolveEffectivePermissionCodes } from "@/lib/permissions/effective";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { listEntitlementsForOrganization } from "@/lib/platform/entitlements";
import { prisma } from "@/lib/prisma";

const PRODUCT_CARDS = [
  {
    productCode: "RESIDENT_V2",
    labelTh: "ระบบรีสอร์ท",
    basePath: "/resident",
    entitlementCode: "resident_v2.access",
  },
  {
    productCode: "GOLDENSOFT_HR",
    labelTh: "บุคลากร",
    basePath: "/hr",
    entitlementCode: "hr.access",
  },
  {
    productCode: "QRSTATION",
    labelTh: "QR Station",
    basePath: "/qrstation",
    entitlementCode: "qrstation.access",
  },
] as const;

const responseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
  }),
  profile: z
    .object({
      displayName: z.string(),
      email: z.string(),
      statusCode: z.string(),
    })
    .nullable(),
  platformRoles: z.array(z.string()),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
  memberships: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      organizationStatus: z.string(),
      roles: z.array(z.string()),
      branches: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          code: z.string(),
        }),
      ),
    }),
  ),
  permissions: z.array(z.string()),
  products: z.array(
    z.object({
      productCode: z.string(),
      labelTh: z.string(),
      basePath: z.string(),
      allowed: z.boolean(),
      subscriptionStatus: z.string().nullable(),
      entitlementCode: z.string(),
    }),
  ),
  entitlementsAllowed: z.array(z.string()),
  contextVersion: z.number().int(),
});

/**
 * Customer App bootstrap — not Platform Admin UI.
 * Returns session + tenant + product entitlement cards + effective permission codes.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  const bundle = await loadPlatformUserBundle(user.id);
  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);

  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;

  const organizationId =
    cookie?.organizationId ??
    (bundle.memberships.length === 1
      ? bundle.memberships[0]!.organizationId
      : null);

  if (!organizationId && !bundle.platformRoles.includes("SUPER_ADMIN")) {
    return NextResponse.json(
      {
        code: "TENANT_CONTEXT_REQUIRED",
        message: "กรุณาเลือกองค์กร",
        user: { id: user.id, email: user.email },
        memberships: bundle.memberships,
      },
      { status: 403 },
    );
  }

  const membership =
    activeMembership ??
    bundle.memberships.find((m) => m.organizationId === organizationId) ??
    null;

  const branchId = cookie?.branchId ?? null;
  const branch =
    membership && branchId
      ? (membership.branches.find((b) => b.id === branchId) ?? null)
      : null;

  const organizationRoles = membership?.roles ?? [];
  const roleMapped = permissionsForRoles({
    platformRoles: bundle.platformRoles,
    organizationRoles,
  });

  let effectiveCodes: string[] = roleMapped;
  if (organizationId) {
    try {
      effectiveCodes = await resolveEffectivePermissionCodes(
        prisma,
        user.id,
        organizationId,
      );
      if (effectiveCodes.length === 0) {
        effectiveCodes = roleMapped;
      } else {
        effectiveCodes = Array.from(
          new Set([...effectiveCodes, ...roleMapped]),
        );
      }
    } catch {
      effectiveCodes = roleMapped;
    }
  }

  const entitlements = organizationId
    ? await listEntitlementsForOrganization(prisma, organizationId)
    : [];

  const entitlementsAllowed = entitlements
    .filter((e) => e.status.code === "ACTIVE" || e.status.code === "TRIAL")
    .map((e) => e.code);

  const inactiveSub = new Set(["SUSPENDED", "CANCELLED", "EXPIRED"]);

  const products = PRODUCT_CARDS.map((card) => {
    const rows = entitlements.filter((e) => e.code === card.entitlementCode);
    const row = rows[0];
    const subStatus = row?.subscription?.status.code ?? null;
    const entitlementActive =
      row != null &&
      (row.status.code === "ACTIVE" || row.status.code === "TRIAL");
    const subOk = !subStatus || !inactiveSub.has(subStatus);
    return {
      productCode: card.productCode,
      labelTh: card.labelTh,
      basePath: card.basePath,
      allowed: entitlementActive && subOk,
      subscriptionStatus: subStatus ?? row?.status.code ?? null,
      entitlementCode: card.entitlementCode,
    };
  }).filter((p) => {
    // Only surface products the org has some entitlement row for (or SUPER_ADMIN preview)
    if (bundle.platformRoles.includes("SUPER_ADMIN")) return true;
    return entitlements.some((e) => e.code === p.entitlementCode);
  });

  const payload = responseSchema.parse({
    user: { id: user.id, email: user.email },
    profile: bundle.profile
      ? {
          displayName: bundle.profile.displayName,
          email: bundle.profile.email,
          statusCode: bundle.profile.statusCode,
        }
      : null,
    platformRoles: bundle.platformRoles,
    organizationId: organizationId ?? null,
    organizationName:
      membership?.organizationName ??
      (organizationId ? organizationId : null),
    branchId,
    branchName: branch?.name ?? null,
    memberships: bundle.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      roles: m.roles,
      branches: m.branches,
    })),
    permissions: effectiveCodes,
    products,
    entitlementsAllowed,
    contextVersion: 1,
  });

  return NextResponse.json(payload);
}
