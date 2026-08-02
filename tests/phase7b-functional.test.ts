import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { createProductSchema, updateProductSchema } from "../src/lib/platform/products-admin";
import {
  createPlanSchema,
  duplicatePlanVersionSchema,
} from "../src/lib/platform/plans-admin";
import {
  filterInactivePermissions,
  unionPermissionCodes,
} from "../src/lib/permissions/effective-helpers";
import { detectEntitlementConsistency } from "../src/lib/platform/entitlements";
import { resolveSeedMode } from "../src/lib/seed/seed-mode";
import { DEMO_ORG_CODES, DEMO_MARKER } from "../src/lib/seed/demo-dataset";
import { checkAdditiveMigrationSql } from "../src/lib/db/migration-safety";
import { permissionsForRoles, PLATFORM_PERMISSIONS } from "../src/lib/permissions/codes";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("Phase 7B product and plan validation", () => {
  it("rejects invalid product codes and accepts valid create payload", () => {
    assert.throws(() => createProductSchema.parse({ code: "bad", nameTh: "ก", nameEn: "a" }));
    const ok = createProductSchema.parse({
      code: "RESIDENT_V2",
      nameTh: "รีสอร์ท",
      nameEn: "Resort",
      productType: "APPLICATION",
      sortOrder: 1,
    });
    assert.equal(ok.code, "RESIDENT_V2");
  });

  it("update product schema does not accept code mutation through typed fields", () => {
    const parsed = updateProductSchema.parse({ nameTh: "ใหม่" });
    assert.equal("code" in parsed, false);
  });

  it("rejects negative plan price and trial days", () => {
    assert.throws(() =>
      createPlanSchema.parse({
        productId: "11111111-1111-4111-8111-111111111111",
        code: "STD",
        name: "Standard",
        billingCycleCode: "MONTHLY",
        basePrice: -1,
        trialDays: 0,
      }),
    );
    assert.throws(() =>
      createPlanSchema.parse({
        productId: "11111111-1111-4111-8111-111111111111",
        code: "STD",
        name: "Standard",
        billingCycleCode: "MONTHLY",
        basePrice: 0,
        trialDays: -3,
      }),
    );
  });

  it("duplicate plan version defaults currency/price overrides safely", () => {
    const parsed = duplicatePlanVersionSchema.parse({ basePrice: 100, publish: true });
    assert.equal(parsed.basePrice, 100);
    assert.equal(parsed.publish, true);
  });
});

describe("Phase 7B effective permissions helpers", () => {
  it("unions and deduplicates permission codes", () => {
    assert.deepEqual(
      unionPermissionCodes([
        ["platform.user.read", "platform.role.assign"],
        ["platform.user.read", "platform.audit.read"],
      ]),
      ["platform.audit.read", "platform.role.assign", "platform.user.read"],
    );
  });

  it("excludes inactive permissions", () => {
    assert.deepEqual(
      filterInactivePermissions([
        { code: "a", isActive: true },
        { code: "b", isActive: false },
      ]),
      ["a"],
    );
  });

  it("OWNER has role.assign and ADMIN does not by default", () => {
    const owner = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["OWNER"],
    });
    const admin = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["ADMIN"],
    });
    assert.ok(owner.includes(PLATFORM_PERMISSIONS.roleAssign));
    assert.equal(admin.includes(PLATFORM_PERMISSIONS.roleAssign), false);
  });
});

describe("Phase 7B entitlement consistency", () => {
  it("detects missing entitlements from snapshot featureCodes", () => {
    const result = detectEntitlementConsistency({
      snapshotJson: {
        featureCodes: ["a.access", "a.limit"],
        limits: { "a.limit": 3 },
      },
      entitlementCodes: ["a.access"],
    });
    assert.equal(result.stale, true);
    assert.deepEqual(result.missing, ["a.limit"]);
  });
});

describe("Phase 7B demo seed guards", () => {
  it("rejects development-demo in production", () => {
    assert.throws(() => resolveSeedMode("development-demo", "production"));
  });

  it("demo codes never include GOLDENSOFT and carry demo marker", () => {
    assert.ok(DEMO_MARKER.includes("ตัวอย่าง"));
    for (const code of DEMO_ORG_CODES) {
      assert.match(code, /-DEMO$/);
      assert.equal(code.includes("GOLDENSOFT"), false);
    }
  });

  it("ships demo seed and cleanup scripts with production guards", () => {
    assert.ok(exists("scripts/seed-demo.ts"));
    assert.ok(exists("scripts/seed-demo-cleanup.ts"));
    assert.match(read("scripts/seed-demo.ts"), /forbidden in production/);
    assert.match(read("scripts/seed-demo-cleanup.ts"), /forbidden in production/);
    assert.match(read("src/lib/seed/demo-dataset.ts"), /no Auth|DEMO_MOCK_NO_SEND|example\.invalid/i);
    assert.match(read("package.json"), /"seed:demo"/);
    assert.match(read("package.json"), /"seed:demo:cleanup"/);
  });
});

describe("Phase 7B APIs and pages surface", () => {
  it("exposes product plan subscription CRUD routes and pages", () => {
    for (const rel of [
      "src/app/api/platform/products/route.ts",
      "src/app/api/platform/products/[id]/route.ts",
      "src/app/api/platform/plans/route.ts",
      "src/app/api/platform/plans/[id]/route.ts",
      "src/app/api/platform/subscriptions/[id]/route.ts",
      "src/app/api/platform/subscriptions/[id]/actions/route.ts",
      "src/app/products/new/page.tsx",
      "src/app/plans/new/page.tsx",
      "src/app/subscriptions/new/page.tsx",
      "src/app/users/profiles/[id]/page.tsx",
      "src/lib/permissions/effective.ts",
    ]) {
      assert.ok(exists(rel), rel);
    }
  });

  it("subscription actions cover lifecycle verbs", () => {
    const src = read("src/lib/platform/subscriptions.ts");
    for (const name of [
      "activateSubscription",
      "suspendSubscription",
      "resumeSubscription",
      "cancelSubscription",
      "expireSubscription",
      "changePlan",
      "extendSubscriptionEndDate",
    ]) {
      assert.match(src, new RegExp(name));
    }
  });

  it("entitlement check returns allowed/value/reason shape", () => {
    const src = read("src/app/api/platform/entitlements/check/route.ts");
    assert.match(src, /allowed/);
    assert.match(src, /subscriptionStatus/);
    assert.match(src, /membershipOrganizationIds/);
  });
});

describe("Phase 7B migration 0005 subscription history", () => {
  it("keeps additive subscription history migration SQL", () => {
    const rel = "prisma/migrations/0005_phase7b_subscription_history/migration.sql";
    assert.ok(exists(rel));
    const sql = read(rel);
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.equal(/\bCREATE\s+TYPE\b|\bAS\s+ENUM\b/i.test(sql), false);
    assert.equal(/\bDROP\s+TABLE\b/i.test(sql), false);
    assert.match(sql, /subscription_histories/);
    assert.doesNotMatch(read("package.json"), /migrate deploy/);
  });
});

describe("Phase 7B security regressions", () => {
  it("does not flip AUTH_INVITE_MODE", () => {
    assert.doesNotMatch(read("package.json"), /AUTH_INVITE_MODE\s*=/);
    assert.match(read("src/app/settings/page.tsx"), /AUTH_INVITE_MODE/);
  });

  it("settings remains read-only without fake save", () => {
    const src = read("src/app/settings/page.tsx");
    assert.equal(/<button[^>]*type=["']submit["']/i.test(src), false);
  });
});
