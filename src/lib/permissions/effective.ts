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
import { loadPlatformRolePermissionOverrides } from "@/lib/platform/platform-roles";

export type EffectivePermissionRow = {
  code: string;
  nameTh: string;
  product: string;
  resource: string;
  action: string;
  sourceRole: string;
  sourceKind: "platform" | "organization_system" | "organization_custom";
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
  return code;
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
    for (const roleCode of platformRoles) {
      const rolePerms = permissionsForRoles({
        platformRoles: [roleCode],
        organizationRoles: [],
        platformRolePermissionOverrides: platformOverrides,
      });
      for (const code of rolePerms) {
        const meta = parsePermissionMeta(code);
        addRow({
          code,
          nameTh: labelFor(code),
          product: meta.product,
          resource: meta.resource,
          action: meta.action,
          sourceRole: roleCode,
          sourceKind: "platform",
          organizationId: null,
          organizationScope: "แพลตฟอร์ม",
          branchScope: "ทั้งหมด",
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
  const result = await resolveEffectivePermissions(db, {
    authUserId,
    organizationId,
  });
  return result.codes;
}

export function hasEffectivePermission(
  codes: string[],
  permission: PlatformPermission | string,
): boolean {
  return codes.includes(permission);
}

/** Exported for unit tests — pure union/dedup helpers. */
export function unionPermissionCodes(groups: string[][]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const code of group) set.add(code);
  }
  return [...set].sort();
}

export function filterInactivePermissions(
  rows: Array<{ code: string; isActive: boolean }>,
): string[] {
  return rows.filter((r) => r.isActive).map((r) => r.code);
}

export { PLATFORM_PERMISSIONS };
