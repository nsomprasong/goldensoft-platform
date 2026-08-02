import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { checkAdditiveMigrationSql } from "../src/lib/db/migration-safety";
import { canAccessOrganization, decideAccess } from "../src/lib/auth/access";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  permissionsForRoles,
} from "../src/lib/permissions/codes";
import { resolveSeedMode } from "../src/lib/seed/seed-mode";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("Phase 7 migration preview", () => {
  it("ships additive 0004 preview without enums or drops of tables", () => {
    const migrationPath =
      "prisma/migrations/0004_phase7_operations/migration.sql";
    assert.ok(exists(migrationPath));
    const sql = read(migrationPath);
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.equal(/\bCREATE\s+TYPE\b|\bAS\s+ENUM\b/i.test(sql), false);
    assert.equal(/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(sql), false);
    assert.match(sql, /organization_roles/);
    assert.match(sql, /"permissions"/);
    assert.match(sql, /organization_role_permissions/);
    assert.match(sql, /"entitlements"/);
    assert.match(sql, /organization_onboardings/);
    assert.match(sql, /custom_role\.create/);
    assert.match(sql, /Do NOT apply without explicit approval/i);
  });

  it("does not mark 0004 as applied in source", () => {
    assert.doesNotMatch(
      read("package.json"),
      /migrate deploy|db push|prisma migrate resolve/,
    );
  });
});

describe("Phase 7 permission catalog", () => {
  it("covers the required platform permission codes with Thai labels", () => {
    for (const code of [
      "platform.organization.read",
      "platform.organization.manage",
      "platform.branch.read",
      "platform.branch.manage",
      "platform.user.read",
      "platform.user.invite",
      "platform.user.manage",
      "platform.user.suspend",
      "platform.role.read",
      "platform.role.manage",
      "platform.role.assign",
      "platform.audit.read",
      "platform.product.read",
      "platform.product.manage",
      "platform.plan.read",
      "platform.plan.manage",
      "platform.subscription.read",
      "platform.subscription.manage",
      "platform.settings.read",
      "platform.settings.manage",
    ]) {
      assert.ok(
        Object.values(PLATFORM_PERMISSIONS).includes(code as never),
        code,
      );
      assert.ok(PLATFORM_PERMISSION_LABELS[code as never], code);
      assert.notEqual(PLATFORM_PERMISSION_LABELS[code as never], code);
    }
  });

  it("gives OWNER role.manage and keeps ADMIN without role.manage by default", () => {
    const owner = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["OWNER"],
    });
    const admin = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["ADMIN"],
    });
    assert.ok(owner.includes(PLATFORM_PERMISSIONS.roleManage));
    assert.ok(!admin.includes(PLATFORM_PERMISSIONS.roleManage));
  });

  it("merges custom permission codes into effective permissions", () => {
    const perms = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["ADMIN"],
      customPermissionCodes: [PLATFORM_PERMISSIONS.roleManage],
    });
    assert.ok(perms.includes(PLATFORM_PERMISSIONS.roleManage));
  });
});

describe("Phase 7 custom roles and assignment surface", () => {
  it("exposes custom role APIs and builder routes", () => {
    assert.ok(exists("src/app/api/platform/roles/route.ts"));
    assert.ok(exists("src/app/api/platform/roles/[id]/route.ts"));
    assert.ok(exists("src/app/roles/new/page.tsx"));
    assert.ok(exists("src/app/roles/[id]/page.tsx"));
    assert.ok(exists("src/app/roles/[id]/edit/page.tsx"));
    assert.match(
      read("src/lib/platform/custom-roles.ts"),
      /SYSTEM_ROLE_IMMUTABLE|allowSystemPermissionEdit|resolveActorPermissionCodes/,
    );
    assert.match(
      read("src/app/roles/[id]/edit/page.tsx"),
      /allowSystemPermissionEdit|แก้ไขสิทธิ์/,
    );
    assert.ok(exists("src/app/roles/platform/[id]/edit/page.tsx"));
    assert.match(
      read("src/lib/platform/platform-roles.ts"),
      /updatePlatformRole|loadPlatformRolePermissionOverrides/,
    );
    assert.match(
      read("prisma/migrations/0012_platform_role_permissions/migration.sql"),
      /platform_role_permissions/,
    );
    assert.match(read("src/lib/platform/custom-roles.ts"), /organizationId: input.organizationId/);
    assert.match(
      read("src/lib/platform/membership-roles.ts"),
      /LAST_OWNER|wouldRemoveLastOwner/,
    );
  });

  it("locks system roles and scopes custom roles to one organization", () => {
    const source = read("src/lib/platform/custom-roles.ts");
    assert.match(source, /isSystem/);
    assert.match(source, /ROLE_CODE_EXISTS|organizationId: input.organizationId/);
    assert.match(source, /INACTIVE_PERMISSION/);
  });
});

describe("Phase 7 organization selector and onboarding", () => {
  it("allows SUPER_ADMIN platform-admin access without membership", () => {
    assert.equal(
      canAccessOrganization([], "00000000-0000-4000-8000-000000000001", {
        platformRoles: ["SUPER_ADMIN"],
        allowPlatformAdmin: true,
      }),
      true,
    );
    assert.equal(
      canAccessOrganization([], "00000000-0000-4000-8000-000000000001"),
      false,
    );
    const decision = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "ACTIVE",
        displayName: "Admin",
        email: "a@example.com",
      },
      memberships: [],
      platformRoles: ["SUPER_ADMIN"],
      contextMode: "platform_admin",
      claimedOrganizationId: "00000000-0000-4000-8000-000000000001",
    });
    assert.equal(decision.kind, "ready");
  });

  it("keeps normal users membership-only", () => {
    const decision = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "ACTIVE",
        displayName: "User",
        email: "u@example.com",
      },
      memberships: [],
      platformRoles: [],
    });
    assert.equal(decision.kind, "no_membership");
  });

  it("ships onboarding wizard and API", () => {
    assert.ok(exists("src/components/organization-onboarding-wizard.tsx"));
    assert.ok(exists("src/app/api/platform/organizations/onboard/route.ts"));
    assert.match(
      read("src/app/organizations/new/page.tsx"),
      /OrganizationOnboardingWizard/,
    );
    const wizard = read("src/components/organization-onboarding-wizard.tsx");
    assert.doesNotMatch(wizard, /\bslug\b/);
    assert.match(wizard, /customerCodeHint|TH\.org\.customerCodeHint/);
    assert.match(wizard, /organizationEntityType|INDIVIDUAL|StaffIdentityFields/);
    assert.match(wizard, /stepProductPlan|selections/);
    assert.match(
      read("src/lib/platform/organization-onboarding.ts"),
      /allocateUniqueOrganizationSlug|selections/,
    );
    assert.match(
      read("src/lib/platform/organization-onboarding.ts"),
      /resolveOnboardingOwnerAuth|needsPasswordSetup|userPasswordReset/,
    );
    assert.match(
      read("src/components/organization-onboarding-wizard.tsx"),
      /ownerFirstLoginHint/,
    );
    assert.match(
      read("src/lib/platform/organization-admins.ts"),
      /listOrganizationAdminContacts|requestOrganizationAdminPasswordReset|addOrganizationAdminContact/,
    );
    assert.match(
      read("src/app/organizations/[id]/page.tsx"),
      /OrganizationAdminsPanel/,
    );
    assert.match(
      read("prisma/migrations/0011_organization_entity_type/migration.sql"),
      /entity_type/,
    );
    assert.match(
      read("src/components/context-switcher.tsx"),
      /TH\.nav\.platformHomeBadge/,
    );
    assert.match(
      read("src/lib/i18n/th.ts"),
      /platformHomeBadge:\s*["'][^"']+["']/,
    );
  });
});

describe("Phase 7 products plans subscriptions entitlements", () => {
  it("generates entitlements from subscription snapshots", () => {
    const source = read("src/lib/platform/entitlements.ts");
    assert.match(source, /resident_v2\.access|generateEntitlementsForSubscription/);
    assert.match(source, /mergeSubscriptionFeatureCatalog|hr\.access/);
    assert.match(source, /assertOrganizationEntitlement/);
    assert.ok(exists("src/app/api/platform/entitlements/check/route.ts"));
    assert.match(
      read("src/lib/platform/subscriptions.ts"),
      /generateEntitlementsForSubscription/,
    );
  });

  it("records Phase 7 audit action codes", () => {
    assert.match(
      read("src/lib/platform/master-codes.ts"),
      /CUSTOM_ROLE_CREATE|SUBSCRIPTION_CHANGE_PLAN|ORGANIZATION_ONBOARD/,
    );
  });
});

describe("Phase 7 seed guards and settings", () => {
  it("rejects development-demo seed in production", () => {
    assert.equal(resolveSeedMode("system", "production"), "system");
    assert.throws(() => resolveSeedMode("development-demo", "production"));
    assert.equal(
      resolveSeedMode("development-demo", "development"),
      "development-demo",
    );
  });

  it("settings has no fake action buttons", () => {
    const settings = read("src/app/settings/page.tsx");
    assert.doesNotMatch(settings, /<button[^>]*>/);
    assert.match(settings, /ยังไม่เปิดใช้งาน|อ่านอย่างเดียว|Invite mode|โหมดคำเชิญ/);
    assert.match(settings, /Phase 7/);
  });
});

describe("Phase 7 security regressions", () => {
  it("does not flip AUTH_INVITE_MODE", () => {
    assert.doesNotMatch(
      read("src/app/users/invite/page.tsx"),
      /AUTH_INVITE_MODE\s*=\s*["']real["']/,
    );
  });

  it("keeps tenant isolation helpers fail-closed for normal users", () => {
    assert.equal(
      canAccessOrganization(
        [
          {
            organizationId: "a",
            organizationName: "A",
            organizationStatus: "ACTIVE",
            roles: ["OWNER"],
            branches: [],
          },
        ],
        "b",
      ),
      false,
    );
  });

  it("mentions hard-delete prohibition for assigned roles", () => {
    assert.match(read("src/lib/platform/custom-roles.ts"), /ROLE_IN_USE|revokedAt/);
  });

  it("documents seed modes without production demo", () => {
    assert.ok(exists("scripts/seed-phase7.ts"));
    assert.match(read("scripts/seed-phase7.ts"), /development-demo/);
    assert.match(read("scripts/seed-phase7.ts"), /loadProjectEnv/);
    assert.match(read("src/lib/seed/seed-mode.ts"), /forbidden in production/);
  });
});
