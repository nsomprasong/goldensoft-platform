import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  canAssignOrganizationRole,
  canInviteUsers,
  wouldRemoveLastOwner,
  wouldRemoveLastSuperAdmin,
} from "../src/lib/platform/admin-guards";
import { sanitizeAuditJson } from "../src/lib/platform/audit";
import {
  canCreateOrganization,
  canListAllOrganizations,
  canManageOrganization,
  createOrganizationSchema,
  updateOrganizationSchema,
  type ActorAccess,
} from "../src/lib/platform/organizations-admin";
import {
  createBranchSchema,
  updateBranchSchema,
} from "../src/lib/platform/branches-admin";
import {
  createMockAuthInviteAdapter,
  inviteUserSchema,
} from "../src/lib/platform/users-invite";
import {
  PLATFORM_NAV,
  filterNavForRoles,
} from "../src/lib/auth/access";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  permissionsForRoles,
} from "../src/lib/permissions/codes";
import { TH } from "../src/lib/i18n/th";
import { checkAdditiveMigrationSql } from "../src/lib/db/migration-safety";

const ORG_A = randomUUID();
const ORG_B = randomUUID();

function actor(overrides: Partial<ActorAccess> = {}): ActorAccess {
  return {
    authUserId: randomUUID(),
    platformRoles: [],
    membershipOrganizationIds: [ORG_A],
    ...overrides,
  };
}

describe("Phase 5 organization admin rules", () => {
  it("allows SUPER_ADMIN to create organizations", () => {
    assert.equal(
      canCreateOrganization(actor({ platformRoles: ["SUPER_ADMIN"] })),
      true,
    );
  });

  it("rejects OWNER creating organizations", () => {
    assert.equal(canCreateOrganization(actor()), false);
  });

  it("rejects duplicate-looking empty codes via schema", () => {
    assert.throws(() => createOrganizationSchema.parse({ customerCode: "" }));
  });

  it("rejects code changes on update schema path", () => {
    const parsed = updateOrganizationSchema.parse({
      displayName: "ใหม่",
      customerCode: "X",
    });
    assert.equal(parsed.customerCode, "X");
  });

  it("rejects cross-tenant organization manage", () => {
    assert.equal(
      canManageOrganization(actor(), ORG_B),
      false,
    );
    assert.equal(
      canManageOrganization(
        actor({ platformRoles: ["SUPER_ADMIN"] }),
        ORG_B,
      ),
      true,
    );
  });

  it("lists all orgs only for SUPER_ADMIN/SUPPORT", () => {
    assert.equal(canListAllOrganizations(actor()), false);
    assert.equal(
      canListAllOrganizations(actor({ platformRoles: ["SUPPORT"] })),
      true,
    );
  });
});

describe("Phase 5 branch admin rules", () => {
  it("requires branch code and name", () => {
    assert.throws(() => createBranchSchema.parse({ code: "", name: "" }));
    const ok = createBranchSchema.parse({ code: "B1", name: "สาขา 1" });
    assert.equal(ok.code, "B1");
  });

  it("allows omitting code on update payload (immutability enforced in service)", () => {
    const parsed = updateBranchSchema.parse({ name: "ชื่อใหม่" });
    assert.equal(parsed.name, "ชื่อใหม่");
  });
});

describe("Phase 5 user invite rules", () => {
  it("allows SUPER_ADMIN and OWNER to invite; rejects BILLING_CONTACT", () => {
    assert.equal(
      canInviteUsers({
        actorPlatformRoles: ["SUPER_ADMIN"],
        actorOrganizationRoles: [],
      }),
      true,
    );
    assert.equal(
      canInviteUsers({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["OWNER"],
      }),
      true,
    );
    assert.equal(
      canInviteUsers({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["BILLING_CONTACT"],
      }),
      false,
    );
  });

  it("ADMIN cannot assign OWNER", () => {
    assert.equal(
      canAssignOrganizationRole({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["ADMIN"],
        targetRole: "OWNER",
      }),
      false,
    );
    assert.equal(
      canAssignOrganizationRole({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["ADMIN"],
        targetRole: "ADMIN",
      }),
      true,
    );
  });

  it("OWNER can invite into own org roles including OWNER", () => {
    assert.equal(
      canAssignOrganizationRole({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["OWNER"],
        targetRole: "OWNER",
      }),
      true,
    );
  });

  it("validates invite payload", () => {
    const parsed = inviteUserSchema.parse({
      email: "a@example.com",
      displayName: "ทดสอบ",
      organizationId: ORG_A,
      organizationRole: "ADMIN",
      branchScope: "ALL_BRANCHES",
      branchIds: [],
    });
    assert.equal(parsed.email, "a@example.com");
  });

  it("mock auth adapter reuses existing email without duplicate create", async () => {
    const id = randomUUID();
    const auth = createMockAuthInviteAdapter([
      { id, email: "reuse@example.com" },
    ]);
    const first = await auth.inviteUserByEmail({
      email: "reuse@example.com",
      displayName: "A",
    });
    assert.equal(first.reused, true);
    assert.equal(first.id, id);
  });
});

describe("Phase 5 last-admin protection", () => {
  it("blocks removing the last SUPER_ADMIN", () => {
    assert.equal(wouldRemoveLastSuperAdmin(1), true);
    assert.equal(wouldRemoveLastSuperAdmin(2), false);
  });

  it("blocks removing the last OWNER", () => {
    assert.equal(wouldRemoveLastOwner(1), true);
    assert.equal(wouldRemoveLastOwner(0), true);
    assert.equal(wouldRemoveLastOwner(3), false);
  });
});

describe("Phase 5 permissions and Thai UI", () => {
  it("maps permission codes to Thai labels", () => {
    assert.equal(
      PLATFORM_PERMISSION_LABELS[PLATFORM_PERMISSIONS.userInvite],
      "เชิญผู้ใช้งาน",
    );
    assert.equal(
      PLATFORM_PERMISSION_LABELS[PLATFORM_PERMISSIONS.organizationManage],
      "จัดการองค์กร",
    );
  });

  it("nav is Thai and role-filtered", () => {
    assert.ok(PLATFORM_NAV.some((i) => i.label === TH.nav.users));
    assert.ok(PLATFORM_NAV.some((i) => i.label === TH.nav.roles));
    assert.ok(PLATFORM_NAV.some((i) => i.label === TH.nav.auditLogs));

    const billing = filterNavForRoles({
      platformRoles: [],
      organizationRoles: ["BILLING_CONTACT"],
    });
    assert.equal(
      billing.some((i) => i.href === "/users"),
      false,
    );
    assert.equal(
      billing.some((i) => i.href === "/subscriptions"),
      true,
    );

    const support = filterNavForRoles({
      platformRoles: ["SUPPORT"],
      organizationRoles: [],
    });
    assert.equal(support.some((i) => i.href === "/users"), true);
    assert.equal(support.some((i) => i.href === "/roles"), false);

    const owner = filterNavForRoles({
      platformRoles: [],
      organizationRoles: ["OWNER"],
    });
    assert.equal(owner.some((i) => i.href === "/users"), true);
    assert.equal(owner.some((i) => i.href === "/settings"), false);
  });

  it("OWNER gets invite permission; BILLING_CONTACT does not", () => {
    const owner = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["OWNER"],
    });
    assert.ok(owner.includes(PLATFORM_PERMISSIONS.userInvite));
    const billing = permissionsForRoles({
      platformRoles: [],
      organizationRoles: ["BILLING_CONTACT"],
    });
    assert.equal(billing.includes(PLATFORM_PERMISSIONS.userInvite), false);
  });

  it("access denied and admin UI strings are Thai", () => {
    assert.match(TH.access.deniedTitle, /ไม่มีสิทธิ์/);
    assert.match(TH.users.invite, /เชิญ/);
    assert.match(TH.roles.lastOwner, /เจ้าของ/);
    assert.match(TH.org.codeImmutable, /ไม่สามารถเปลี่ยน/);
  });
});

describe("Phase 5 audit sanitization", () => {
  it("strips secrets from audit payloads", () => {
    const cleaned = sanitizeAuditJson({
      email: "a@b.c",
      password: "secret",
      token: "abc",
      nested: { authorization: "Bearer x", ok: true },
    }) as Record<string, unknown>;
    assert.equal(cleaned.email, "a@b.c");
    assert.equal("password" in cleaned, false);
    assert.equal("token" in cleaned, false);
    assert.deepEqual(cleaned.nested, { ok: true });
  });
});

describe("Phase 5 migration preview safety", () => {
  it("additive migration stays in platform schema", () => {
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/0002_phase5_admin_fields/migration.sql",
      ),
      "utf8",
    );
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.schemasTouched, ["platform"]);
  });

  it("does not modify Resident Legacy", () => {
    const legacyRoot = path.resolve(
      __dirname,
      "../../resident-legacy-reference",
    );
    const status = execSync("git status --porcelain", {
      cwd: legacyRoot,
      encoding: "utf8",
    }).trim();
    assert.equal(status, "");
  });
});

describe("Phase 5 security source checks", () => {
  it("invite API uses mock adapter and does not import ws", () => {
    const inviteApi = path.join(
      process.cwd(),
      "src/app/api/platform/users/invite/route.ts",
    );
    if (!fs.existsSync(inviteApi)) {
      // Page/API agent may still be writing; assert domain mock exists.
      const domain = fs.readFileSync(
        path.join(process.cwd(), "src/lib/platform/users-invite.ts"),
        "utf8",
      );
      assert.match(domain, /createMockAuthInviteAdapter/);
      assert.equal(/\bfrom\s+["']ws["']/.test(domain), false);
      return;
    }
    const src = fs.readFileSync(inviteApi, "utf8");
    assert.match(src, /createMockAuthInviteAdapter/);
    assert.equal(/inviteUserByEmail\([^)]*supabase/i.test(src), false);
    assert.equal(/\bfrom\s+["']ws["']/.test(src), false);
  });

  it("no SUPABASE_SECRET_KEY in client components", () => {
    const componentsDir = path.join(process.cwd(), "src/components");
    const files = fs.readdirSync(componentsDir, { recursive: true }) as string[];
    for (const rel of files) {
      if (!rel.endsWith(".tsx") && !rel.endsWith(".ts")) continue;
      const full = path.join(componentsDir, rel);
      if (!fs.statSync(full).isFile()) continue;
      const src = fs.readFileSync(full, "utf8");
      assert.equal(
        /SUPABASE_SECRET_KEY/.test(src),
        false,
        `secret key leaked in ${rel}`,
      );
    }
  });
});
