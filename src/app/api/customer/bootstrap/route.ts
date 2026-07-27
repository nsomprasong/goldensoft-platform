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
import { CUSTOMER_PRODUCT_CARDS } from "@/lib/platform/customer-products";
import {
  canonicalProductCode,
  listEntitlementsForOrganization,
} from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

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
  contextMode: z.enum(["membership", "platform_admin"]),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
  activeBranches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    }),
  ),
  platformAdminOrganizations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
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
  entitlements: z.array(
    z.object({
      code: z.string(),
      productCode: z.string(),
      allowed: z.boolean(),
      value: z.string().nullable(),
      subscriptionStatus: z.string().nullable(),
      expiresAt: z.string().nullable(),
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
  if (!bundle.profile) {
    return NextResponse.json(
      { code: "PROFILE_NOT_FOUND", message: "ไม่พบโปรไฟล์ผู้ใช้" },
      { status: 403 },
    );
  }
  if (bundle.profile.statusCode !== "ACTIVE") {
    return NextResponse.json(
      { code: "PROFILE_SUSPENDED", message: "บัญชีผู้ใช้ถูกระงับ" },
      { status: 403 },
    );
  }
  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);

  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;
  const isSuper = bundle.platformRoles.includes("SUPER_ADMIN");

  if (
    cookie &&
    !activeMembership &&
    !(isSuper && cookie.mode === "platform_admin")
  ) {
    return NextResponse.json(
      { code: "ORG_FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึงองค์กรนี้" },
      { status: 403 },
    );
  }

  const organizationId =
    cookie?.organizationId ??
    (bundle.memberships.length === 1
      ? bundle.memberships[0]!.organizationId
      : null);

  const membership =
    activeMembership ??
    bundle.memberships.find((m) => m.organizationId === organizationId) ??
    null;

  const branchId = cookie?.branchId ?? null;
  let branch =
    membership && branchId
      ? (membership.branches.find((b) => b.id === branchId) ?? null)
      : null;
  let organizationName = membership?.organizationName ?? null;
  let activeBranches = membership?.branches ?? [];

  if (branchId && membership && !branch) {
    return NextResponse.json(
      { code: "BRANCH_FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึงสาขานี้" },
      { status: 403 },
    );
  }

  const platformAdminOrganizationsPromise = isSuper
    ? prisma.organization.findMany({
        where: {
          deletedAt: null,
          status: { code: MASTER.organizationStatus.ACTIVE },
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
        take: 200,
      })
    : Promise.resolve([]);

  if (organizationId && !membership) {
    if (!(isSuper && cookie?.mode === "platform_admin")) {
      return NextResponse.json(
        { code: "ORG_FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึงองค์กรนี้" },
        { status: 403 },
      );
    }
    const adminOrganization = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
        status: { code: MASTER.organizationStatus.ACTIVE },
      },
      select: {
        displayName: true,
        branches: {
          where: {
            deletedAt: null,
            status: { code: MASTER.branchStatus.ACTIVE },
          },
          select: { id: true, name: true, code: true },
          orderBy: { code: "asc" },
          take: 200,
        },
      },
    });
    if (!adminOrganization) {
      return NextResponse.json(
        { code: "ORG_FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึงองค์กรนี้" },
        { status: 403 },
      );
    }
    organizationName = adminOrganization.displayName;
    activeBranches = adminOrganization.branches;
    branch = branchId
      ? (activeBranches.find((row) => row.id === branchId) ?? null)
      : null;
    if (branchId && !branch) {
      return NextResponse.json(
        { code: "BRANCH_FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึงสาขานี้" },
        { status: 403 },
      );
    }
  }

  const organizationRoles = membership?.roles ?? [];
  const roleMapped = permissionsForRoles({
    platformRoles: bundle.platformRoles,
    organizationRoles,
  });

  const effectiveCodesPromise = organizationId
    ? resolveEffectivePermissionCodes(
        prisma,
        user.id,
        organizationId,
      ).catch(() => [] as string[])
    : Promise.resolve([] as string[]);
  const entitlementsPromise = organizationId
    ? listEntitlementsForOrganization(prisma, organizationId)
    : Promise.resolve([]);
  const [
    platformAdminOrganizations,
    resolvedEffectiveCodes,
    entitlements,
  ] = await Promise.all([
    platformAdminOrganizationsPromise,
    effectiveCodesPromise,
    entitlementsPromise,
  ]);
  const effectiveCodes =
    resolvedEffectiveCodes.length === 0
      ? roleMapped
      : Array.from(new Set([...resolvedEffectiveCodes, ...roleMapped]));

  const entitlementsAllowed = entitlements
    .filter((e) => e.status.code === "ACTIVE" || e.status.code === "TRIAL")
    .map((e) => e.code);

  const inactiveSub = new Set(["SUSPENDED", "CANCELLED", "EXPIRED"]);

  const products = CUSTOMER_PRODUCT_CARDS.map((card) => {
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
    if (isSuper) return true;
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
    contextMode: cookie?.mode ?? "membership",
    organizationId: organizationId ?? null,
    organizationName,
    branchId,
    branchName: branch?.name ?? null,
    activeBranches,
    platformAdminOrganizations: platformAdminOrganizations.map((row) => ({
      id: row.id,
      name: row.displayName,
    })),
    memberships: bundle.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      roles: m.roles,
      branches: m.branches,
    })),
    permissions: effectiveCodes,
    products,
    entitlements: entitlements.map((row) => {
      const subscriptionStatus = row.subscription?.status.code ?? null;
      const allowed =
        (row.status.code === "ACTIVE" || row.status.code === "TRIAL") &&
        (!subscriptionStatus || !inactiveSub.has(subscriptionStatus));
      return {
        code: row.code,
        productCode: canonicalProductCode(row.product.code),
        allowed,
        value: row.limitValue,
        subscriptionStatus,
        expiresAt:
          row.subscription?.endsAt?.toISOString() ??
          row.endsAt?.toISOString() ??
          null,
      };
    }),
    entitlementsAllowed,
    contextVersion: 1,
  });

  return NextResponse.json(payload);
}
