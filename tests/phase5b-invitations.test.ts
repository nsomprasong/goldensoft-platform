import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  AuthInviteError,
  MockAuthInviteAdapter,
  SupabaseAuthInviteAdapter,
} from "../src/lib/auth/auth-invite-adapter";
import {
  InviteEnvironmentError,
  resolveInviteEnvironment,
} from "../src/lib/auth/invite-env";
import { validateInvitePassword } from "../src/lib/auth/accept-invite";
import {
  canAssignOrganizationRole,
  canInviteUsers,
} from "../src/lib/platform/admin-guards";
import { checkAdditiveMigrationSql } from "../src/lib/db/migration-safety";
import { canInviteOrganizationUser } from "../src/lib/platform/user-invitations";

const USER_ID = "10000000-0000-4000-a000-000000000001";
const EMAIL = "invite@example.com";

describe("Phase 5B invitation environment", () => {
  it("rejects mock invite mode in production", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "production",
          AUTH_INVITE_MODE: "mock",
          NEXT_PUBLIC_APP_URL: "https://app.example.com",
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_MOCK_IN_PRODUCTION",
    );
  });

  it("requires HTTPS app URL in production", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "production",
          AUTH_INVITE_MODE: "real",
          NEXT_PUBLIC_APP_URL: "http://app.example.com",
          NEXT_PUBLIC_SUPABASE_URL: "https://horyhrnqbeaivdztekfv.supabase.co",
          SUPABASE_SECRET_KEY: "test-secret",
          EXPECTED_SUPABASE_PROJECT_REF: "horyhrnqbeaivdztekfv",
        }),
      /HTTPS/,
    );
  });

  it("rejects protocol-relative open redirects", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "test",
          AUTH_INVITE_MODE: "mock",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          SUPABASE_INVITE_REDIRECT_PATH: "//evil.example/steal",
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_REDIRECT_INVALID",
    );
  });

  it("builds the redirect URL on the server", () => {
    const result = resolveInviteEnvironment({
      NODE_ENV: "test",
      AUTH_INVITE_MODE: "mock",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SUPABASE_INVITE_REDIRECT_PATH: "/auth/accept-invite",
    });
    assert.equal(result.redirectTo, "http://localhost:3000/auth/accept-invite");
  });
});

describe("Phase 5B permission rules", () => {
  it("allows SUPER_ADMIN and OWNER but rejects BILLING_CONTACT", () => {
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

  it("prevents ADMIN assigning OWNER", () => {
    assert.equal(
      canAssignOrganizationRole({
        actorPlatformRoles: [],
        actorOrganizationRoles: ["ADMIN"],
        targetRole: "OWNER",
      }),
      false,
    );
  });

  it("scopes OWNER and ADMIN permissions to the target organization", () => {
    const actor = {
      authUserId: USER_ID,
      platformRoles: [],
      membershipOrganizationIds: ["org-a", "org-b"],
      organizationRoles: ["OWNER", "BILLING_CONTACT"],
      organizationRolesByOrganization: {
        "org-a": ["OWNER"],
        "org-b": ["BILLING_CONTACT"],
      },
    };
    assert.equal(canInviteOrganizationUser(actor, "org-a", "ADMIN"), true);
    assert.equal(canInviteOrganizationUser(actor, "org-b", "ADMIN"), false);
  });
});

describe("Phase 5B Auth invite adapters", () => {
  it("mock adapter performs no network and reuses a deterministic Auth user", async () => {
    const adapter = new MockAuthInviteAdapter();
    const first = await adapter.inviteUser({
      email: EMAIL,
      displayName: "ผู้ทดสอบ",
      redirectTo: "http://localhost:3000/auth/accept-invite",
    });
    const second = await adapter.getUserByEmail(EMAIL);
    assert.equal(second.found, true);
    assert.equal(second.found && second.authUserId, first.authUserId);
    assert.equal(adapter.sent.length, 1);
  });

  it("validates a successful Supabase response", async () => {
    const adapter = createRealAdapter(async () =>
      Response.json({ id: USER_ID, email: EMAIL, email_confirmed_at: null }),
    );
    const result = await adapter.inviteUser(inviteInput());
    assert.equal(result.authUserId, USER_ID);
    assert.equal(result.invited, true);
  });

  for (const [status, body, expected] of [
    [400, { message: "invalid email" }, "AUTH_INVITE_EMAIL_INVALID"],
    [401, { message: "invalid api key" }, "AUTH_INVITE_ADMIN_KEY_INVALID"],
    [403, { message: "forbidden" }, "AUTH_INVITE_ADMIN_KEY_INVALID"],
    [422, { message: "user already registered" }, "AUTH_INVITE_ALREADY_EXISTS"],
    [429, { message: "rate limited" }, "AUTH_INVITE_RATE_LIMITED"],
    [500, { message: "internal error" }, "AUTH_INVITE_FAILED"],
  ] as const) {
    it(`maps Supabase HTTP ${status} safely`, async () => {
      const adapter = createRealAdapter(async () => Response.json(body, { status }));
      await assert.rejects(
        () => adapter.inviteUser(inviteInput()),
        (error) => error instanceof AuthInviteError && error.code === expected,
      );
    });
  }

  it("maps timeout/network failures", async () => {
    const adapter = createRealAdapter(async () => {
      throw new Error("network details must not escape");
    });
    await assert.rejects(
      () => adapter.inviteUser(inviteInput()),
      (error) =>
        error instanceof AuthInviteError &&
        error.code === "AUTH_INVITE_NETWORK_ERROR",
    );
  });

  it("rejects invalid success responses", async () => {
    const adapter = createRealAdapter(async () => Response.json({ ok: true }));
    await assert.rejects(
      () => adapter.inviteUser(inviteInput()),
      (error) =>
        error instanceof AuthInviteError &&
        error.code === "AUTH_INVITE_RESPONSE_INVALID",
    );
  });
});

describe("Phase 5B saga, idempotency, and security source checks", () => {
  const root = process.cwd();
  const service = fs.readFileSync(
    path.join(root, "src/lib/platform/user-invitations.ts"),
    "utf8",
  );
  const adapter = fs.readFileSync(
    path.join(root, "src/lib/auth/auth-invite-adapter.ts"),
    "utf8",
  );
  const acceptForm = fs.readFileSync(
    path.join(root, "src/components/accept-invite-form.tsx"),
    "utf8",
  );

  it("persists intent before Auth and compensates platform setup failure", () => {
    assert.ok(
      service.indexOf("userInvitation.create") <
        service.indexOf("auth.getUserByEmail"),
    );
    assert.match(service, /PLATFORM_SETUP_FAILED/);
    assert.match(service, /isolationLevel: "Serializable"/);
  });

  it("contains idempotency and active invitation uniqueness in migration", () => {
    const sql = fs.readFileSync(
      path.join(
        root,
        "prisma/migrations/0003_user_invitations/migration.sql",
      ),
      "utf8",
    );
    assert.match(sql, /idempotency_key/);
    assert.match(sql, /user_invitations_active_email_org_key/);
    const safety = checkAdditiveMigrationSql(sql);
    assert.equal(safety.ok, true, safety.errors.join("; "));
  });

  it("stores correct Thai name_th values without mojibake in migration", () => {
    const sql = fs.readFileSync(
      path.join(
        root,
        "prisma/migrations/0003_user_invitations/migration.sql",
      ),
      "utf8",
    );

    const expectedThai = [
      "รอส่งคำเชิญ",
      "ส่งคำเชิญแล้ว",
      "เปิดใช้งานแล้ว",
      "ส่งไม่สำเร็จ",
      "จัดเตรียมสิทธิ์ไม่สำเร็จ",
      "ยกเลิก",
      "หมดอายุ",
      "ร้องขอส่งคำเชิญ",
      "ส่งคำเชิญไม่สำเร็จ",
      "ร้องขอส่งคำเชิญอีกครั้ง",
      "ส่งคำเชิญอีกครั้งแล้ว",
      "ส่งคำเชิญอีกครั้งไม่สำเร็จ",
      "ยอมรับคำเชิญ",
      "จัดเตรียมสิทธิ์สำเร็จ",
    ];
    for (const text of expectedThai) {
      assert.ok(sql.includes(text), `migration must contain Thai text: ${text}`);
    }

    const mojibakePatterns = [/à¸/, /à¹/, /â€/, /เธ[\u0e00-\u0e7f]/, /เน€/];
    for (const pattern of mojibakePatterns) {
      assert.equal(
        pattern.test(sql),
        false,
        `migration must not contain mojibake: ${pattern.source}`,
      );
    }

    assert.match(
      sql,
      /INSERT INTO "platform"\."audit_action_types"\s*\(\s*"id",\s*"code",\s*"name_th",\s*"name_en",\s*"sort_order",\s*"created_at",\s*"updated_at"\s*\)/,
    );
    assert.match(sql, /ON CONFLICT \("code"\) DO NOTHING/);
    const auditInsert = sql.slice(sql.indexOf('INSERT INTO "platform"."audit_action_types"'));
    assert.equal(
      (auditInsert.match(/gen_random_uuid\(\)/g) ?? []).length,
      9,
      "each audit row must call gen_random_uuid()",
    );
    assert.equal(
      (auditInsert.match(/CURRENT_TIMESTAMP/g) ?? []).length,
      18,
      "each audit row must set created_at and updated_at with CURRENT_TIMESTAMP",
    );
  });

  it("uses REST fetch without Realtime/WebSocket or secret logging", () => {
    assert.match(adapter, /\/auth\/v1\/invite/);
    assert.equal(/\bWebSocket\b|\brealtime\b|from\s+["']ws["']/.test(adapter), false);
    assert.equal(/console\.(log|error|warn)/.test(adapter), false);
  });

  it("does not log or manually persist invite tokens", () => {
    assert.equal(/console\.(log|error|warn)/.test(acceptForm), false);
    assert.equal(/localStorage|sessionStorage/.test(acceptForm), false);
  });

  it("rejects password mismatch before accepting an invitation", () => {
    assert.match(validateInvitePassword("password1", "password2") ?? "", /ไม่ตรงกัน/);
    assert.equal(validateInvitePassword("password1", "password1"), null);
  });

  it("keeps the secret out of Client Components", () => {
    const componentsRoot = path.join(root, "src/components");
    for (const relative of fs.readdirSync(componentsRoot, {
      recursive: true,
    }) as string[]) {
      const full = path.join(componentsRoot, relative);
      if (!/\.[jt]sx?$/.test(relative) || !fs.statSync(full).isFile()) continue;
      assert.equal(/SUPABASE_SECRET_KEY/.test(fs.readFileSync(full, "utf8")), false);
    }
  });
});

function createRealAdapter(
  fetchTransport: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
  return new SupabaseAuthInviteAdapter({
    supabaseUrl: "https://project.supabase.co",
    secretKey: "test-secret",
    expectedProjectRef: "project",
    blockedLegacyProjectRef: "invnwpyshxdadhocueeh",
    fetchTransport,
  });
}

function inviteInput() {
  return {
    email: EMAIL,
    displayName: "ผู้ทดสอบ",
    redirectTo: "https://app.example.com/auth/accept-invite",
  };
}
