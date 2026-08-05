import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  COOKIE_NAME,
  contextCookieOptions,
  decodeContextCookie,
  encodeContextCookie,
  type PlatformContextCookie,
} from "@/lib/context/cookie";
import { TH } from "@/lib/i18n/th";
import { resolveEffectivePermissionCodes } from "@/lib/permissions/effective";
import { permissionsForRoles } from "@/lib/permissions/codes";
import {
  customerBootstrapCacheKey,
  readCustomerBootstrapCache,
  writeCustomerBootstrapCache,
} from "@/lib/platform/customer-bootstrap-cache";
import { listActiveManagedOrganizationIds } from "@/lib/platform/customer-portfolio";
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
      phone: z.string().nullable().optional(),
      statusCode: z.string(),
    })
    .nullable(),
  platformRoles: z.array(z.string()),
  contextMode: z.enum(["membership", "platform_admin", "managed_org"]),
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
      customerCode: z.string().nullable().optional(),
    }),
  ),
  memberships: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      organizationStatus: z.string(),
      customerCode: z.string().nullable().optional(),
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

  let cookie: PlatformContextCookie | null = decodeContextCookie(
    request.cookies.get(COOKIE_NAME)?.value,
  );
  let clearStaleContextCookie = false;
  let persistContextCookie = false;

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

  const isSuper = bundle.platformRoles.includes("SUPER_ADMIN");
  const managedOrganizationIds = await listActiveManagedOrganizationIds(
    prisma,
    bundle.profile.id,
  );
  const isStaffSupportClaim = (mode: string | undefined, orgId: string | undefined) =>
    Boolean(
      orgId &&
        ((isSuper && mode === "platform_admin") ||
          (mode === "managed_org" && managedOrganizationIds.includes(orgId))),
    );
  let activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie!.organizationId)
    : null;

  // Stale gs_platform_ctx from a previous browser user/org is common on shared
  // devices and after switching test accounts — drop it instead of 403.
  if (
    cookie &&
    !activeMembership &&
    !isStaffSupportClaim(cookie.mode, cookie.organizationId)
  ) {
    cookie = null;
    activeMembership = null;
    clearStaleContextCookie = true;
  }

  const bootstrapKey = customerBootstrapCacheKey({
    authUserId: user.id,
    organizationId: cookie?.organizationId ?? null,
    branchId: cookie?.branchId ?? null,
    mode: cookie?.mode ?? "membership",
  });
  // Skip cache when context cookie is missing so single-org/branch staff
  // still get an auto-bound gs_platform_ctx on the response.
  const cachedBootstrap =
    cookie?.organizationId && !clearStaleContextCookie
      ? readCustomerBootstrapCache(bootstrapKey)
      : null;
  if (cachedBootstrap) {
    return NextResponse.json(cachedBootstrap);
  }

  let organizationId =
    cookie?.organizationId ??
    (bundle.memberships.length === 1
      ? bundle.memberships[0]!.organizationId
      : null);

  // Single-org members: bind org without forcing a picker.
  if (
    !cookie?.organizationId &&
    organizationId &&
    bundle.memberships.length === 1
  ) {
    persistContextCookie = true;
  }

  // Multi-org: restore last organization so login opens the shell with the
  // header ContextSwitcher — no full-page org picker.
  if (!organizationId && bundle.profile && bundle.memberships.length > 1) {
    const preference = await prisma.userPreference.findUnique({
      where: { userProfileId: bundle.profile.id },
      select: { lastOrganizationId: true },
    });
    if (
      preference?.lastOrganizationId &&
      bundle.memberships.some(
        (m) => m.organizationId === preference.lastOrganizationId,
      )
    ) {
      organizationId = preference.lastOrganizationId;
      persistContextCookie = true;
    }
  }

  // First-time multi-org with no preference: pick first membership so the user
  // lands in the shell and can switch from the header.
  if (!organizationId && bundle.memberships.length > 1) {
    organizationId = bundle.memberships[0]!.organizationId;
    persistContextCookie = true;
  }

  const membership =
    activeMembership ??
    bundle.memberships.find((m) => m.organizationId === organizationId) ??
    null;

  let branchId = cookie?.branchId ?? null;
  let branch =
    membership && branchId
      ? (membership.branches.find((b) => b.id === branchId) ?? null)
      : null;
  let organizationName = membership?.organizationName ?? null;
  let activeBranches = membership?.branches ?? [];

  // Stale branch on a valid org — keep the org, ignore the branch.
  if (branchId && membership && !branch) {
    branchId = null;
  }

  // Restore last home branch (e.g. after HR transfer) when cookie has none.
  if (
    membership &&
    !branchId &&
    bundle.profile &&
    !isStaffSupportClaim(cookie?.mode, organizationId ?? undefined)
  ) {
    const preference = await prisma.userPreference.findUnique({
      where: { userProfileId: bundle.profile.id },
      select: { lastBranchId: true },
    });
    if (preference?.lastBranchId) {
      const preferred =
        activeBranches.find((row) => row.id === preference.lastBranchId) ??
        null;
      if (preferred) {
        branchId = preferred.id;
        branch = preferred;
        persistContextCookie = true;
      }
    }
  }

  // Single-branch scope (e.g. branch-assigned staff): lock to that branch.
  if (
    membership &&
    !branchId &&
    activeBranches.length === 1 &&
    !isStaffSupportClaim(cookie?.mode, organizationId ?? undefined)
  ) {
    branchId = activeBranches[0]!.id;
    branch = activeBranches[0]!;
    persistContextCookie = true;
  }

  const platformAdminOrganizationsPromise = isSuper
    ? prisma.organization.findMany({
        where: {
          deletedAt: null,
          status: { code: MASTER.organizationStatus.ACTIVE },
        },
        select: { id: true, displayName: true, customerCode: true },
        orderBy: { displayName: "asc" },
        take: 200,
      })
    : Promise.resolve([]);
  const superPermissionCodesPromise = isSuper
    ? prisma.permission.findMany({
        where: { isActive: true },
        select: { code: true },
        orderBy: { code: "asc" },
      })
    : Promise.resolve([]);

  if (organizationId && !membership) {
    if (!isStaffSupportClaim(cookie?.mode, organizationId)) {
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
    superPermissionRows,
  ] = await Promise.all([
    platformAdminOrganizationsPromise,
    effectiveCodesPromise,
    entitlementsPromise,
    superPermissionCodesPromise,
  ]);
  const effectiveCodes = Array.from(
    new Set([
      ...(resolvedEffectiveCodes.length === 0 ? roleMapped : resolvedEffectiveCodes),
      ...roleMapped,
      ...superPermissionRows.map((permission) => permission.code),
    ]),
  ).sort();

  const inactiveSub = new Set(["SUSPENDED", "CANCELLED", "EXPIRED"]);
  const activeEntitlementCodes = entitlements
    .filter((e) => e.status.code === "ACTIVE" || e.status.code === "TRIAL")
    .filter((e) => {
      const subStatus = e.subscription?.status.code ?? null;
      return !subStatus || !inactiveSub.has(subStatus);
    })
    .map((e) => e.code);

  // SUPER_ADMIN can open runtime-available products even when the org has no
  // paid entitlement (inspect / support). Coming-soon products stay locked in UI.
  const superBypassCodes = isSuper
    ? CUSTOMER_PRODUCT_CARDS.filter((card) => card.runtimeStatus === "available").map(
        (card) => card.entitlementCode,
      )
    : [];
  const entitlementsAllowed = Array.from(
    new Set([...activeEntitlementCodes, ...superBypassCodes]),
  );

  const products = CUSTOMER_PRODUCT_CARDS.map((card) => {
    const rows = entitlements.filter((e) => e.code === card.entitlementCode);
    const row = rows[0];
    const subStatus = row?.subscription?.status.code ?? null;
    const entitlementActive =
      row != null &&
      (row.status.code === "ACTIVE" || row.status.code === "TRIAL");
    const subOk = !subStatus || !inactiveSub.has(subStatus);
    const orgAllowed = entitlementActive && subOk;
    const superAllowed = isSuper && card.runtimeStatus === "available";
    return {
      productCode: card.productCode,
      labelTh: card.labelTh,
      basePath: card.basePath,
      allowed: orgAllowed || superAllowed,
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
          phone: bundle.profile.phone ?? null,
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
      customerCode: row.customerCode,
    })),
    memberships: bundle.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      customerCode: m.customerCode ?? null,
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
    // Bump when SUPER_ADMIN / managed_org support rules change so stale cache
    // cannot keep products locked after a deploy.
    contextVersion: 4,
  });

  writeCustomerBootstrapCache(bootstrapKey, payload);
  const response = NextResponse.json(payload);
  if (clearStaleContextCookie) {
    response.cookies.set(COOKIE_NAME, "", contextCookieOptions(0));
  } else if (
    persistContextCookie &&
    organizationId &&
    !isStaffSupportClaim(cookie?.mode, organizationId)
  ) {
    response.cookies.set(
      COOKIE_NAME,
      encodeContextCookie({
        organizationId,
        branchId,
        branchSelected:
          branchId != null ||
          (membership != null && membership.branches.length <= 1),
        mode: "membership",
      }),
      contextCookieOptions(),
    );
  }
  return response;
}
