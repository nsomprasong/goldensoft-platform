import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  deleteMasterIfAllowed,
  requireActiveMasterId,
  updateMasterMetadata,
} from "../src/lib/platform/master-data";

describe("Master tables replace enums", () => {
  it("Prisma schema has no enum declarations", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf8",
    );
    assert.equal(/^\s*enum\s+\w+/m.test(schema), false);
  });

  it("master models declare unique code", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf8",
    );
    const masters = [
      "UserProfileStatus",
      "PlatformRole",
      "BillingCycle",
      "SubscriptionStatus",
    ];
    for (const name of masters) {
      const block = schema.match(
        new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
      )?.[0];
      assert.ok(block, `missing model ${name}`);
      assert.match(block, /code\s+String\s+@unique/);
    }

    // OrganizationRole is org-scoped in Phase 7: uniqueness is enforced with
    // partial indexes (system code / org+code), not a single @unique on code.
    const orgRole = schema.match(
      /model OrganizationRole \{[\s\S]*?\n\}/,
    )?.[0];
    assert.ok(orgRole);
    assert.match(orgRole, /organizationId\s+String\?/);
    assert.doesNotMatch(orgRole, /code\s+String\s+@unique/);
  });

  it("Role assignment models use roleId foreign keys", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf8",
    );
    assert.match(schema, /model PlatformRoleAssignment[\s\S]*roleId/);
    assert.match(schema, /model OrganizationMembershipRole[\s\S]*roleId/);
    assert.match(schema, /model PlatformRole \{/);
    assert.match(schema, /model OrganizationRole \{/);
  });

  it("rejects deleting isSystem masters", async () => {
    const db = {
      platformRole: {
        findUnique: async () => ({
          id: "r1",
          code: "SUPER_ADMIN",
          nameTh: "x",
          nameEn: "x",
          description: null,
          sortOrder: 1,
          isActive: true,
          isSystem: true,
        }),
        delete: async () => {
          throw new Error("delete should not run");
        },
      },
      platformRoleAssignment: { count: async () => 0 },
    };

    await assert.rejects(
      () =>
        deleteMasterIfAllowed(db as never, "platformRole", "r1"),
      /system master/,
    );
  });

  it("rejects code change when master is referenced", async () => {
    const db = {
      subscriptionStatus: {
        findUnique: async () => ({
          id: "s1",
          code: "ACTIVE",
          nameTh: "ใช้งาน",
          nameEn: "Active",
          description: null,
          sortOrder: 1,
          isActive: true,
          isSystem: true,
        }),
        update: async () => {
          throw new Error("update should not run");
        },
      },
      subscription: { count: async () => 2 },
    };

    await assert.rejects(
      () =>
        updateMasterMetadata(db as never, "subscriptionStatus", "s1", {
          code: "ACTIVE_V2",
        }),
      /already referenced/,
    );
  });

  it("rejects inactive masters for new writes", async () => {
    const db = {
      billingCycle: {
        findUnique: async () => ({
          id: "b1",
          code: "MONTHLY",
          nameTh: "รายเดือน",
          nameEn: "Monthly",
          description: null,
          sortOrder: 1,
          isActive: false,
          isSystem: true,
        }),
      },
    };

    await assert.rejects(
      () => requireActiveMasterId(db as never, "billingCycle", "MONTHLY"),
      /inactive/,
    );
  });

  it("allows reading inactive master metadata (row still returned)", async () => {
    const inactive = {
      id: "b1",
      code: "MONTHLY",
      nameTh: "รายเดือน",
      nameEn: "Monthly",
      description: null,
      sortOrder: 1,
      isActive: false,
      isSystem: true,
    };
    const db = {
      billingCycle: {
        findUnique: async () => inactive,
      },
    };
    const { getMasterByCode } = await import("../src/lib/platform/master-data");
    const row = await getMasterByCode(db as never, "billingCycle", "MONTHLY");
    assert.equal(row?.isActive, false);
    assert.equal(row?.code, "MONTHLY");
  });
});
