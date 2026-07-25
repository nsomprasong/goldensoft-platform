import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  canAccessBranch,
  canAccessOrganization,
  decideAccess,
  filterNavForRoles,
  isAuthPage,
  isProtectedPath,
  type MembershipSummary,
} from "../src/lib/auth/access";
import {
  decodeContextCookie,
  encodeContextCookie,
} from "../src/lib/context/cookie";
import { TH } from "../src/lib/i18n/th";
import { assertSafeEnvironment } from "../src/lib/env/guard";

const PROJECT_ROOT = path.resolve(process.cwd());

function membership(
  overrides: Partial<MembershipSummary> & {
    organizationId: string;
    organizationName: string;
  },
): MembershipSummary {
  return {
    organizationStatus: "ACTIVE",
    roles: ["ADMIN"],
    branches: [
      { id: "b1", name: "สาขาหลัก", code: "HQ" },
      { id: "b2", name: "สาขา 2", code: "B2" },
    ],
    ...overrides,
  };
}

describe("Phase 4 access decisions", () => {
  it("redirects unauthenticated users to login", () => {
    const d = decideAccess({
      authenticated: false,
      profile: null,
      memberships: [],
    });
    assert.equal(d.kind, "unauthenticated");
  });

  it("blocks login without platform profile", () => {
    const d = decideAccess({
      authenticated: true,
      profile: null,
      memberships: [],
    });
    assert.equal(d.kind, "no_profile");
    if (d.kind === "no_profile") {
      assert.match(d.title, /ยังไม่ได้รับสิทธิ์/);
    }
  });

  it("blocks suspended profiles", () => {
    const d = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "DISABLED",
        displayName: "ทดสอบ",
        email: "a@b.c",
      },
      memberships: [],
    });
    assert.equal(d.kind, "profile_suspended");
  });

  it("blocks users with no membership", () => {
    const d = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "ACTIVE",
        displayName: "ทดสอบ",
        email: "a@b.c",
      },
      memberships: [],
    });
    assert.equal(d.kind, "no_membership");
  });

  it("auto-selects a single organization", () => {
    const d = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "ACTIVE",
        displayName: "ทดสอบ",
        email: "a@b.c",
      },
      memberships: [
        membership({
          organizationId: "org-1",
          organizationName: "องค์กรเดียว",
          branches: [{ id: "b1", name: "สาขาเดียว", code: "HQ" }],
        }),
      ],
    });
    assert.equal(d.kind, "ready");
    if (d.kind === "ready") {
      assert.equal(d.organizationId, "org-1");
      assert.equal(d.autoSelected, true);
      assert.equal(d.autoBranchId, "b1");
    }
  });

  it("requires selection when multiple organizations exist", () => {
    const d = decideAccess({
      authenticated: true,
      profile: {
        statusCode: "ACTIVE",
        displayName: "ทดสอบ",
        email: "a@b.c",
      },
      memberships: [
        membership({ organizationId: "org-1", organizationName: "A" }),
        membership({ organizationId: "org-2", organizationName: "B" }),
      ],
    });
    assert.equal(d.kind, "select_organization");
  });

  it("rejects organization and branch outside membership", () => {
    const memberships = [
      membership({ organizationId: "org-1", organizationName: "A" }),
    ];
    assert.equal(canAccessOrganization(memberships, "org-2"), false);
    assert.equal(canAccessBranch(memberships, "org-1", "b99"), false);
    assert.equal(canAccessBranch(memberships, "org-1", "b1"), true);
  });

  it("rejects tampered context cookie signatures", () => {
    process.env.PLATFORM_CONTEXT_COOKIE_SECRET =
      process.env.PLATFORM_CONTEXT_COOKIE_SECRET || "phase4-test-secret-key";
    const raw = encodeContextCookie({
      organizationId: "11111111-1111-1111-1111-111111111111",
      branchId: null,
    });
    const tampered = raw.replace(/\.[^.]+$/, ".invalidsignature");
    assert.equal(decodeContextCookie(tampered), null);
  });

  it("filters navigation by roles", () => {
    const limited = filterNavForRoles({
      platformRoles: [],
      organizationRoles: ["BILLING_CONTACT"],
    });
    assert.ok(limited.some((i) => i.href === "/organizations"));
    assert.equal(
      limited.some((i) => i.href === "/subscriptions"),
      false,
    );

    const admin = filterNavForRoles({
      platformRoles: ["SUPER_ADMIN"],
      organizationRoles: [],
    });
    assert.ok(admin.some((i) => i.href === "/subscriptions"));
  });

  it("protects app paths but not login", () => {
    assert.equal(isProtectedPath("/organizations"), true);
    assert.equal(isProtectedPath("/login"), false);
    assert.equal(isAuthPage("/login"), true);
  });

  it("blocks test auth in production", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      nodeEnv: "production",
      allowTestAuth: "true",
      publishableKey: "pub",
      caCertPath: "certs/prod-ca-2021.crt",
      projectRoot: PROJECT_ROOT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEST_AUTH_IN_PRODUCTION");
  });

  it("primary UI strings are Thai", () => {
    assert.match(TH.login.title, /เข้าสู่ระบบ/);
    assert.match(TH.nav.organizations, /องค์กร/);
    assert.match(TH.access.noProfileTitle, /ยังไม่ได้รับสิทธิ์/);
    assert.equal(TH.status.ACTIVE, "ใช้งาน");
    assert.equal(TH.role.OWNER, "เจ้าขององค์กร");

    const loginPage = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/app/login/page.tsx"),
      "utf8",
    );
    assert.match(loginPage, /TH\.login\.title|เข้าสู่ระบบ/);
  });
});
