import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { checkAdditiveMigrationSql } from "../src/lib/db/migration-safety";
import { canAccessOrganization, decideAccess } from "../src/lib/auth/access";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "../src/lib/permissions/codes";
import {
  canManageCustomerOrganization,
  canManagePortfolioAssignments,
} from "../src/lib/platform/customer-portfolio";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

const MIGRATION_PATH =
  "prisma/migrations/0007_staff_customer_portfolio/migration.sql";

describe("Phase: Staff customer-portfolio migration preview", () => {
  it("ships as an additive, platform-only preview pending explicit approval", () => {
    assert.ok(exists(MIGRATION_PATH));
    const sql = read(MIGRATION_PATH);
    assert.match(
      sql,
      /-- Additive migration\. Do NOT apply without explicit approval\./,
    );
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.schemasTouched, ["platform"]);
    assert.equal(/\bCREATE\s+TYPE\b|\bAS\s+ENUM\b/i.test(sql), false);
    assert.equal(/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(sql), false);
  });

  it("creates staff_organization_assignments with FKs, indexes and an active-only unique constraint", () => {
    const sql = read(MIGRATION_PATH);
    assert.match(sql, /CREATE TABLE "platform"\."staff_organization_assignments"/);
    assert.match(sql, /"staff_user_profile_id" UUID NOT NULL/);
    assert.match(sql, /"organization_id" UUID NOT NULL/);
    assert.match(
      sql,
      /FOREIGN KEY \("staff_user_profile_id"\) REFERENCES "platform"\."user_profiles"\("id"\)/,
    );
    assert.match(
      sql,
      /FOREIGN KEY \("organization_id"\) REFERENCES "platform"\."organizations"\("id"\)/,
    );
    assert.match(
      sql,
      /CREATE UNIQUE INDEX "staff_organization_assignments_active_uidx"[\s\S]*?WHERE "revoked_at" IS NULL/,
    );
  });

  it("never adds staff as organization_memberships", () => {
    const sql = read(MIGRATION_PATH);
    assert.doesNotMatch(sql, /INSERT INTO "platform"\."organization_memberships"/);
    assert.doesNotMatch(sql, /CREATE TABLE "platform"\."organization_memberships"/);
  });

  it("seeds SALES / ACCOUNT_MANAGER roles and the portfolio-manage permission idempotently", () => {
    const sql = read(MIGRATION_PATH);
    assert.match(sql, /'SALES'/);
    assert.match(sql, /'ACCOUNT_MANAGER'/);
    assert.match(sql, /'platform\.customer_portfolio\.manage'/);
    assert.match(sql, /ON CONFLICT \("code"\) DO NOTHING/);
  });

  it("does not flip AUTH_INVITE_MODE", () => {
    assert.doesNotMatch(sqlOf(MIGRATION_PATH), /AUTH_INVITE_MODE/);
    assert.doesNotMatch(
      read("src/lib/platform/customer-portfolio.ts"),
      /AUTH_INVITE_MODE/,
    );
  });

  function sqlOf(rel: string): string {
    return read(rel);
  }
});

describe("Staff customer-portfolio authorization", () => {
  function actor(overrides: {
    platformRoles?: string[];
    managedOrganizationIds?: string[];
  } = {}) {
    return {
      platformRoles: overrides.platformRoles ?? [],
      managedOrganizationIds: overrides.managedOrganizationIds ?? [],
    };
  }

  it("SUPER_ADMIN can manage any customer organization", () => {
    assert.equal(
      canManageCustomerOrganization(
        actor({ platformRoles: ["SUPER_ADMIN"] }),
        "org-a",
      ),
      true,
    );
  });

  it("SALES can manage only an organization actively assigned to them", () => {
    const salesActor = actor({
      platformRoles: ["SALES"],
      managedOrganizationIds: ["org-a"],
    });
    assert.equal(canManageCustomerOrganization(salesActor, "org-a"), true);
    assert.equal(canManageCustomerOrganization(salesActor, "org-b"), false);
  });

  it("ACCOUNT_MANAGER without an assignment cannot manage the organization", () => {
    const accountManager = actor({ platformRoles: ["ACCOUNT_MANAGER"] });
    assert.equal(canManageCustomerOrganization(accountManager, "org-a"), false);
  });

  it("a plain org role (e.g. OWNER-only platform roles) cannot manage unassigned customer orgs", () => {
    assert.equal(
      canManageCustomerOrganization(actor({ platformRoles: [] }), "org-a"),
      false,
    );
  });

  it("only SUPER_ADMIN or platform.customer_portfolio.manage holders may assign/revoke portfolios", () => {
    assert.equal(
      canManagePortfolioAssignments({ platformRoles: ["SUPER_ADMIN"] }),
      true,
    );
    assert.equal(
      canManagePortfolioAssignments({ platformRoles: ["SALES"] }),
      false,
    );
    assert.equal(
      canManagePortfolioAssignments({ platformRoles: ["ACCOUNT_MANAGER"] }),
      false,
    );
    assert.equal(canManagePortfolioAssignments({ platformRoles: [] }), false);
  });
});

describe("permissionsForRoles: SALES / ACCOUNT_MANAGER", () => {
  it("grants the static read-mostly permission set to SALES", () => {
    const perms = permissionsForRoles({
      platformRoles: ["SALES"],
      organizationRoles: [],
    });
    for (const expected of [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.userRead,
      PLATFORM_PERMISSIONS.userInvite,
      PLATFORM_PERMISSIONS.userManage,
      PLATFORM_PERMISSIONS.roleRead,
      PLATFORM_PERMISSIONS.roleManage,
      PLATFORM_PERMISSIONS.roleAssign,
      PLATFORM_PERMISSIONS.productRead,
    ]) {
      assert.ok(perms.includes(expected), `expected SALES to include ${expected}`);
    }
  });

  it("grants the same static permission set to ACCOUNT_MANAGER", () => {
    const perms = permissionsForRoles({
      platformRoles: ["ACCOUNT_MANAGER"],
      organizationRoles: [],
    });
    assert.ok(perms.includes(PLATFORM_PERMISSIONS.userInvite));
    assert.ok(perms.includes(PLATFORM_PERMISSIONS.roleAssign));
  });

  it("commission is out of scope: SALES / ACCOUNT_MANAGER receive no billing permissions", () => {
    const perms = permissionsForRoles({
      platformRoles: ["SALES"],
      organizationRoles: [],
    });
    assert.equal(
      perms.some((code) => code.startsWith("billing.")),
      false,
    );
    assert.equal(perms.includes(PLATFORM_PERMISSIONS.customerPortfolioManage), false);
  });

  it("does not grant platform.customer_portfolio.manage to SALES/ACCOUNT_MANAGER — SUPER_ADMIN only", () => {
    const superAdminPerms = permissionsForRoles({
      platformRoles: ["SUPER_ADMIN"],
      organizationRoles: [],
    });
    assert.ok(
      superAdminPerms.includes(PLATFORM_PERMISSIONS.customerPortfolioManage),
    );
    const salesPerms = permissionsForRoles({
      platformRoles: ["SALES"],
      organizationRoles: [],
    });
    assert.equal(
      salesPerms.includes(PLATFORM_PERMISSIONS.customerPortfolioManage),
      false,
    );
  });
});

describe("assertCanAssign / canManageCustomRoles: managed-org path", () => {
  it("membership-roles.ts allows role assignment via managed-org access, not just membership", () => {
    const source = read("src/lib/platform/membership-roles.ts");
    assert.match(source, /canManageCustomerOrganization/);
    assert.match(source, /hasMembership \|\| hasManagedAccess|hasManagedAccess/);
  });

  it("custom-roles.ts allows managing custom roles via managed-org access", () => {
    const source = read("src/lib/platform/custom-roles.ts");
    assert.match(source, /canManageCustomerOrganization/);
  });

  it("user-invitations.ts allows inviting into a managed customer org", () => {
    const source = read("src/lib/platform/user-invitations.ts");
    assert.match(source, /canManageCustomerOrganization/);
  });
});

describe("Staff portfolio UI has no fake buttons", () => {
  it("assign/revoke buttons always call the real API and reflect pending/error state", () => {
    const src = read("src/components/staff-portfolio-form.tsx");
    assert.match(src, /fetch\("\/api\/platform\/staff-organization-assignments"/);
    assert.doesNotMatch(src, /onClick=\{?\(\)\s*=>\s*\{?\s*\}\}?/);
  });

  it("context switcher only offers managed orgs the staff member is actually assigned", () => {
    const src = read("src/components/context-switcher.tsx");
    assert.match(src, /managedOrganizations/);
    assert.match(src, /managedOrgGroupLabel/);
  });
});

describe("Access decisions respect managed-org context mode", () => {
  it("decideAccess grants ready state for a managed_org claim without membership", () => {
    const decision = decideAccess({
      authenticated: true,
      profile: { statusCode: "ACTIVE", displayName: "Staff", email: "s@example.com" },
      memberships: [],
      claimedOrganizationId: "org-a",
      platformRoles: ["SALES"],
      managedOrganizationIds: ["org-a"],
      contextMode: "managed_org",
    });
    assert.equal(decision.kind, "ready");
    if (decision.kind === "ready") {
      assert.equal(decision.organizationId, "org-a");
    }
  });

  it("decideAccess denies a managed_org claim for an org not in the portfolio", () => {
    const decision = decideAccess({
      authenticated: true,
      profile: { statusCode: "ACTIVE", displayName: "Staff", email: "s@example.com" },
      memberships: [],
      claimedOrganizationId: "org-z",
      platformRoles: ["SALES"],
      managedOrganizationIds: ["org-a"],
      contextMode: "managed_org",
    });
    assert.notEqual(decision.kind, "ready");
  });

  it("canAccessOrganization allows a managed organization id", () => {
    assert.equal(
      canAccessOrganization([], "org-a", { managedOrganizationIds: ["org-a"] }),
      true,
    );
    assert.equal(
      canAccessOrganization([], "org-b", { managedOrganizationIds: ["org-a"] }),
      false,
    );
  });
});
