import type { PrismaClient } from "@prisma/client";
import { cache } from "react";

import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSION_LABELS,
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { permissionResourceGroup } from "@/lib/permissions/codes";
import {
  readEffectiveCodesCache,
  writeEffectiveCodesCache,
} from "@/lib/permissions/effective-codes-cache";
import {
  HR_BRANCH_MANAGER_PERMISSION_CODES,
  HR_MEMBER_PERMISSION_CODES,
  HR_PERMISSION_CODES,
  HR_PRODUCT_CODE,
  hrPermissionLabel,
  isHrPermissionCode,
} from "@/lib/permissions/hr-codes";
import { loadPlatformRolePermissionOverrides } from "@/lib/platform/platform-roles";

export type EffectivePermissionRow = {
  code: string;
  nameTh: string;
  product: string;
  resource: string;
  action: string;
  sourceRole: string;
  sourceKind: "platform" | "customer_support" | "organization_system" | "organization_custom";
  organizationId: string | null;
  organizationScope: string;
  branchScope: string;
};

export type EffectivePermissionsResult = {
  permissions: EffectivePermissionRow[];
  codes: string[];
  branchScopes: Array<{
    organizationId: string;
    scopeType: string;
    branchId: string | null;
  }>;
};

function parsePermissionMeta(code: string): {
  product: string;
  resource: string;
  action: string;
} {
  const parts = code.split(".");
  return {
    product: parts[0] ?? "platform",
    resource: parts[1] ?? permissionResourceGroup(code),
    action: parts[2] ?? "unknown",
  };
}

function labelFor(code: string): string {
  if (code in PLATFORM_PERMISSION_LABELS) {
    return PLATFORM_PERMISSION_LABELS[code as PlatformPermission];
  }
  if (isHrPermissionCode(code)) {
    return hrPermissionLabel(code);
  }
  return code;
}

const ORG_ADMIN_ROLE_CODES = new Set<string>([
  MASTER.organizationRole.OWNER,
  MASTER.organizationRole.ADMIN,
]);

/** OWNER/ADMIN of a customer org get full HR capability when the org is entitled. */
function shouldGrantProductAdminPermissions(roleCodes: string[]): boolean {
  return roleCodes.some((code) => ORG_ADMIN_ROLE_CODES.has(code));
}

function isBranchManagerRole(roleCodes: string[]): boolean {
  return roleCodes.includes(MASTER.organizationRole.BRANCH_MANAGER);
}

/**
 * Request-scoped effective permission calculation.
 * Never cache across users/tenants — React cache is per-request only.
 */
export const resolveEffectivePermissions = cache(
  async function resolveEffectivePermissions(
    db: PrismaClient,
    input: {
      authUserId: string;
      organizationId?: string | null;
    },
  ): Promise<EffectivePermissionsResult> {
    const [assignmentActive, membershipActive] = await Promise.all([
      db.assignmentStatus.findUnique({
        where: { code: MASTER.assignmentStatus.ACTIVE },
        select: { id: true },
      }),
      db.membershipStatus.findUnique({
        where: { code: MASTER.membershipStatus.ACTIVE },
        select: { id: true },
      }),
    ]);
    if (!assignmentActive || !membershipActive) {
      return { permissions: [], codes: [], branchScopes: [] };
    }

    const profile = await db.userProfile.findUnique({
      where: { authUserId: input.authUserId },
      select: {
        id: true,
        platformRoles: {
          where: { statusId: assignmentActive.id, revokedAt: null },
          select: {
            role: { select: { code: true, isActive: true } },
          },
        },
        memberships: {
          where: {
            statusId: membershipActive.id,
            ...(input.organizationId
              ? { organizationId: input.organizationId }
              : {}),
          },
          select: {
            organizationId: true,
            organization: { select: { displayName: true, customerCode: true } },
            roles: {
              where: { statusId: assignmentActive.id, revokedAt: null },
              select: {
                role: {
                  select: {
                    id: true,
                    code: true,
                    nameTh: true,
                    isActive: true,
                    isSystem: true,
                    organizationId: true,
                    permissions: {
                      where: { revokedAt: null },
                      select: {
                        permission: {
                          select: {
                            code: true,
                            nameTh: true,
                            productCode: true,
                            resource: true,
                            action: true,
                            isActive: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            branchScopes: {
              where: { statusId: assignmentActive.id },
              select: {
                branchId: true,
                scopeType: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    if (!profile) {
      return { permissions: [], codes: [], branchScopes: [] };
    }

    const platformRoles = profile.platformRoles
      .filter((r) => r.role.isActive)
      .map((r) => r.role.code);

    const rows: EffectivePermissionRow[] = [];
    const seen = new Set<string>();

    const addRow = (row: EffectivePermissionRow) => {
      const key = `${row.code}|${row.sourceRole}|${row.organizationId ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    };

    // Platform role map (DB overrides when present; SUPER_ADMIN always full).
    const platformOverrides = await loadPlatformRolePermissionOverrides(
      db,
      platformRoles,
    );
    const customerSupportContext = input.organizationId
      ? platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
        (await db.staffOrganizationAssignment.count({
          where: {
            staffUserProfileId: profile.id,
            organizationId: input.organizationId,
            revokedAt: null,
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            AND: [
              { OR: [{ statusId: null }, { status: { code: "ACTIVE" } }] },
            ],
          },
        })) > 0
      : false;
    const entitledProducts = input.organizationId
      ? new Set(
          (
            await db.entitlement.findMany({
              where: {
                organizationId: input.organizationId,
                status: { code: "ACTIVE" },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
              select: { product: { select: { code: true } } },
            })
          ).map((row) => row.product.code),
        )
      : new Set<string>();
    for (const roleCode of platformRoles) {
      let rolePerms = permissionsForRoles({
        platformRoles: [roleCode],
        organizationRoles: [],
        platformRolePermissionOverrides: platformOverrides,
      });
      if (
        input.organizationId &&
        roleCode === MASTER.platformRole.SUPER_ADMIN
      ) {
        rolePerms = (
          await db.permission.findMany({
            where: { isActive: true },
            select: { code: true },
          })
        ).map((permission) => permission.code);
      }
      const permissionMetadata = await db.permission.findMany({
        where: { code: { in: rolePerms }, isActive: true },
        select: { code: true, scopeCode: true, productCode: true },
      });
      const allowedCodes = new Set(
        permissionMetadata
          .filter((permission) => {
            if (!input.organizationId) {
              return permission.scopeCode === "PLATFORM" || permission.scopeCode === "BOTH";
            }
            if (!customerSupportContext) return false;
            const organizationScope =
              permission.scopeCode === "ORGANIZATION" || permission.scopeCode === "BOTH";
            const entitled =
              permission.productCode === "PLATFORM" || entitledProducts.has(permission.productCode);
            return organizationScope && entitled;
          })
          .map((permission) => permission.code),
      );
      for (const code of rolePerms.filter((permission) => allowedCodes.has(permission))) {
        const meta = parsePermissionMeta(code);
        addRow({
          code,
          nameTh: labelFor(code),
          product: meta.product,
          resource: meta.resource,
          action: meta.action,
          sourceRole: roleCode,
          sourceKind: input.organizationId ? "customer_support" : "platform",
          organizationId: input.organizationId ?? null,
          organizationScope: input.organizationId
            ? "องค์กรลูกค้าที่ได้รับมอบหมาย"
            : "แพลตฟอร์ม",
          branchScope: input.organizationId ? "ตามขอบเขตที่ได้รับมอบหมาย" : "ทั้งหมด",
        });
      }
    }

    const branchScopes: EffectivePermissionsResult["branchScopes"] = [];

    for (const membership of profile.memberships) {
      const branchLabel =
        membership.branchScopes
          .map((s) => s.scopeType.code)
          .join(", ") || "NONE";

      for (const scope of membership.branchScopes) {
        branchScopes.push({
          organizationId: membership.organizationId,
          scopeType: scope.scopeType.code,
          branchId: scope.branchId,
        });
      }

      for (const assignment of membership.roles.filter(
        (r) => r.role.isActive && r.role.isSystem,
      )) {
        const role = assignment.role;
        const dbCodes = role.permissions
          .filter((link) => link.permission.isActive)
          .map((link) => link.permission.code);
        const rolePerms =
          dbCodes.length > 0
            ? dbCodes
            : permissionsForRoles({
                platformRoles: [],
                organizationRoles: [role.code],
              });
        for (const code of rolePerms) {
          const meta = parsePermissionMeta(code);
          addRow({
            code,
            nameTh: labelFor(code),
            product: meta.product,
            resource: meta.resource,
            action: meta.action,
            sourceRole: role.code,
            sourceKind: "organization_system",
            organizationId: membership.organizationId,
            organizationScope:
              membership.organization.displayName ||
              membership.organization.customerCode,
            branchScope: branchLabel,
          });
        }
      }

      for (const assignment of membership.roles) {
        const role = assignment.role;
        if (!role.isActive || role.isSystem) continue;
        // Cross-org custom role must be excluded
        if (
          role.organizationId &&
          role.organizationId !== membership.organizationId
        ) {
          continue;
        }
        for (const link of role.permissions) {
          const perm = link.permission;
          if (!perm.isActive) continue;
          addRow({
            code: perm.code,
            nameTh: perm.nameTh || labelFor(perm.code),
            product: perm.productCode,
            resource: perm.resource,
            action: perm.action,
            sourceRole: role.code,
            sourceKind: "organization_custom",
            organizationId: membership.organizationId,
            organizationScope:
              membership.organization.displayName ||
              membership.organization.customerCode,
            branchScope: branchLabel,
          });
        }
      }
    }

    // Product-admin grants: when the org has an active product entitlement,
    // OWNER/ADMIN receive that product's permission catalog so Customer App
    // menus are usable without manually assigning every hr.* code.
    const membershipOrgIds = [
      ...new Set(profile.memberships.map((m) => m.organizationId)),
    ];
    if (membershipOrgIds.length > 0) {
      const hrEntitled = await db.entitlement.findMany({
        where: {
          organizationId: { in: membershipOrgIds },
          code: "hr.access",
          status: {
            code: MASTER.entitlementStatus.ACTIVE,
          },
        },
        select: { organizationId: true },
      });
      const hrOrgIds = new Set(hrEntitled.map((row) => row.organizationId));
      for (const membership of profile.memberships) {
        if (!hrOrgIds.has(membership.organizationId)) continue;
        const roleCodes = membership.roles
          .filter((row) => row.role.isActive)
          .map((row) => row.role.code);
        if (roleCodes.length === 0) continue;
        const branchLabel =
          membership.branchScopes.map((s) => s.scopeType.code).join(", ") ||
          "NONE";
        const isAdmin = shouldGrantProductAdminPermissions(roleCodes);
        const isBranchManager = !isAdmin && isBranchManagerRole(roleCodes);
        const grantCodes = isAdmin
          ? HR_PERMISSION_CODES
          : isBranchManager
            ? HR_BRANCH_MANAGER_PERMISSION_CODES
            : HR_MEMBER_PERMISSION_CODES;
        const sourceRole = isAdmin
          ? roleCodes.includes(MASTER.organizationRole.OWNER)
            ? MASTER.organizationRole.OWNER
            : MASTER.organizationRole.ADMIN
          : isBranchManager
            ? MASTER.organizationRole.BRANCH_MANAGER
            : (roleCodes[0] ?? "MEMBER");
        for (const code of grantCodes) {
          const meta = parsePermissionMeta(code);
          addRow({
            code,
            nameTh: labelFor(code),
            product: HR_PRODUCT_CODE,
            resource: meta.resource,
            action: meta.action,
            sourceRole,
            sourceKind:
              isAdmin || isBranchManager
                ? "organization_system"
                : "organization_custom",
            organizationId: membership.organizationId,
            organizationScope:
              membership.organization.displayName ||
              membership.organization.customerCode,
            branchScope: branchLabel,
          });
        }
      }
    }

    rows.sort((a, b) => a.code.localeCompare(b.code) || a.sourceRole.localeCompare(b.sourceRole));
    const codes = [...new Set(rows.map((r) => r.code))].sort();
    return { permissions: rows, codes, branchScopes };
  },
);

export async function resolveEffectivePermissionCodes(
  db: PrismaClient,
  authUserId: string,
  organizationId?: string | null,
): Promise<string[]> {
  const cached = readEffectiveCodesCache(authUserId, organizationId);
  if (cached) return cached;

  const result = await resolveEffectivePermissions(db, {
    authUserId,
    organizationId,
  });
  writeEffectiveCodesCache(authUserId, organizationId, result.codes);
  return result.codes;
}

export function hasEffectivePermission(
  codes: string[],
  permission: PlatformPermission | string,
): boolean {
  return codes.includes(permission);
}

export {
  filterInactivePermissions,
  unionPermissionCodes,
} from "@/lib/permissions/effective-helpers";

export { PLATFORM_PERMISSIONS };
