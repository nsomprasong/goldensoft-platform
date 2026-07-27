import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  AuthInviteError,
  MockAuthInviteAdapter,
  SupabaseAuthInviteAdapter,
  createAuthInviteAdapter,
} from "../src/lib/auth/auth-invite-adapter";
import {
  DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF,
  DEFAULT_EXPECTED_SUPABASE_PROJECT_REF,
  InviteEnvironmentError,
  REAL_INVITE_CONFIRM_VALUE,
  resolveInviteEnvironment,
} from "../src/lib/auth/invite-env";
import {
  evaluateRealInviteSend,
  maskInviteEmail,
  resolveRealInviteGate,
} from "../src/lib/auth/real-invite-gate";

const ROOT = path.resolve(process.cwd());
const EXPECTED = DEFAULT_EXPECTED_SUPABASE_PROJECT_REF;
const BLOCKED = DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF;

describe("Phase 5C real invite environment", () => {
  it("rejects app URL with path, query, or hash", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "development",
          AUTH_INVITE_MODE: "mock",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000/app",
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_APP_URL_INVALID",
    );
  });

  it("rejects open redirects and unsafe redirect paths", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "development",
          AUTH_INVITE_MODE: "mock",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          SUPABASE_INVITE_REDIRECT_PATH: "//evil.example/phish",
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_REDIRECT_INVALID",
    );
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "development",
          AUTH_INVITE_MODE: "mock",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          SUPABASE_INVITE_REDIRECT_PATH: "/auth/accept-invite?next=https://evil.example",
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_REDIRECT_INVALID",
    );
  });

  it("blocks legacy Supabase project ref", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "development",
          AUTH_INVITE_MODE: "real",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          NEXT_PUBLIC_SUPABASE_URL: `https://${BLOCKED}.supabase.co`,
          SUPABASE_SECRET_KEY: "test-secret",
          EXPECTED_SUPABASE_PROJECT_REF: EXPECTED,
          BLOCKED_LEGACY_SUPABASE_PROJECT_REF: BLOCKED,
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_PROJECT_MISMATCH",
    );
  });

  it("requires expected project ref in real mode", () => {
    assert.throws(
      () =>
        resolveInviteEnvironment({
          NODE_ENV: "development",
          AUTH_INVITE_MODE: "real",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co",
          SUPABASE_SECRET_KEY: "test-secret",
          EXPECTED_SUPABASE_PROJECT_REF: EXPECTED,
        }),
      (error) =>
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_PROJECT_MISMATCH",
    );
  });

  it("builds redirect under app origin with configured path", () => {
    const env = resolveInviteEnvironment({
      NODE_ENV: "development",
      AUTH_INVITE_MODE: "mock",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SUPABASE_INVITE_REDIRECT_PATH: "/auth/accept-invite",
    });
    assert.equal(env.redirectTo, "http://localhost:3000/auth/accept-invite");
    assert.equal(env.redirectPath, "/auth/accept-invite");
    assert.equal(env.appUrl.href.endsWith("/"), true);
  });

  it("allows LAN IP app URL in development", () => {
    const env = resolveInviteEnvironment({
      NODE_ENV: "development",
      AUTH_INVITE_MODE: "mock",
      NEXT_PUBLIC_APP_URL: "http://192.168.1.177:3000",
      SUPABASE_INVITE_REDIRECT_PATH: "/auth/accept-invite",
    });
    assert.equal(env.redirectTo, "http://192.168.1.177:3000/auth/accept-invite");
  });
});

describe("Phase 5C first-real-invite safety gate", () => {
  it("previews without confirmation and performs no send", () => {
    const decision = evaluateRealInviteSend({
      mode: "real",
      email: "tester@example.com",
      env: {},
    });
    assert.equal(decision.action, "preview");
    if (decision.action === "preview") {
      assert.equal(decision.writeOperations, "NONE");
      assert.equal(decision.code, "REAL_INVITE_PREVIEW");
    }
  });

  it("rejects email outside the allow list when confirmation is set", () => {
    const decision = evaluateRealInviteSend({
      mode: "real",
      email: "other@example.com",
      env: {
        AUTH_REAL_INVITE_CONFIRM: REAL_INVITE_CONFIRM_VALUE,
        AUTH_REAL_INVITE_TEST_EMAIL: "tester@example.com",
      },
    });
    assert.equal(decision.action, "reject");
    if (decision.action === "reject") {
      assert.equal(decision.code, "REAL_INVITE_EMAIL_NOT_ALLOWED");
    }
  });

  it("allows flow when confirmation and test email match", () => {
    const decision = evaluateRealInviteSend({
      mode: "real",
      email: "Tester@Example.com",
      env: {
        AUTH_REAL_INVITE_CONFIRM: REAL_INVITE_CONFIRM_VALUE,
        AUTH_REAL_INVITE_TEST_EMAIL: "tester@example.com",
      },
    });
    assert.equal(decision.action, "allow");
  });

  it("allows any email when confirmation is set and allowlist is empty", () => {
    const decision = evaluateRealInviteSend({
      mode: "real",
      email: "anyone@example.com",
      env: {
        AUTH_REAL_INVITE_CONFIRM: REAL_INVITE_CONFIRM_VALUE,
        AUTH_REAL_INVITE_TEST_EMAIL: "",
      },
    });
    assert.equal(decision.action, "allow");
  });

  it("masks emails and never echoes secrets", () => {
    assert.equal(maskInviteEmail("ab@example.com"), "ab***@example.com");
    const gate = resolveRealInviteGate({
      AUTH_REAL_INVITE_CONFIRM: "WRONG",
      AUTH_REAL_INVITE_TEST_EMAIL: "tester@example.com",
    });
    assert.equal(gate.confirmValid, false);
    assert.equal(gate.confirmConfigured, true);
  });

  it("mock mode bypasses the real-send gate", () => {
    const decision = evaluateRealInviteSend({
      mode: "mock",
      email: "anyone@example.com",
      env: {},
    });
    assert.equal(decision.action, "allow");
  });
});

describe("Phase 5C real adapter selection and hygiene", () => {
  it("selects mock adapter in mock mode without network", async () => {
    const env = resolveInviteEnvironment({
      NODE_ENV: "development",
      AUTH_INVITE_MODE: "mock",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    const adapter = createAuthInviteAdapter(env);
    assert.ok(adapter instanceof MockAuthInviteAdapter);
    const result = await adapter.inviteUser({
      email: "a@example.com",
      displayName: "A",
      redirectTo: env.redirectTo,
    });
    assert.equal(result.invited, true);
  });

  it("selects real adapter in real mode with matching project ref", () => {
    const env = resolveInviteEnvironment({
      NODE_ENV: "development",
      AUTH_INVITE_MODE: "real",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED}.supabase.co`,
      SUPABASE_SECRET_KEY: "test-secret",
      EXPECTED_SUPABASE_PROJECT_REF: EXPECTED,
      BLOCKED_LEGACY_SUPABASE_PROJECT_REF: BLOCKED,
    });
    const adapter = createAuthInviteAdapter(env, {
      fetchTransport: async () => Response.json({ id: "00000000-0000-4000-a000-000000000099", email: "a@example.com" }),
    });
    assert.ok(adapter instanceof SupabaseAuthInviteAdapter);
  });

  it("rejects legacy project in real adapter constructor", () => {
    assert.throws(
      () =>
        new SupabaseAuthInviteAdapter({
          supabaseUrl: `https://${BLOCKED}.supabase.co`,
          secretKey: "test-secret",
          expectedProjectRef: EXPECTED,
          blockedLegacyProjectRef: BLOCKED,
        }),
      (error) => error instanceof AuthInviteError && error.code === "AUTH_INVITE_PROJECT_MISMATCH",
    );
  });

  it("rejects javascript and data redirect schemes", async () => {
    const adapter = new SupabaseAuthInviteAdapter({
      supabaseUrl: `https://${EXPECTED}.supabase.co`,
      secretKey: "test-secret",
      expectedProjectRef: EXPECTED,
      blockedLegacyProjectRef: BLOCKED,
      fetchTransport: async () => Response.json({}),
    });
    await assert.rejects(
      () =>
        adapter.inviteUser({
          email: "a@example.com",
          displayName: "A",
          redirectTo: "javascript:alert(1)",
        }),
      (error) =>
        error instanceof AuthInviteError &&
        error.code === "AUTH_INVITE_REDIRECT_INVALID",
    );
  });

  it("keeps secrets out of client components and readiness script is read-only", () => {
    const readiness = fs.readFileSync(
      path.join(ROOT, "scripts/verify-real-invite-readiness.ts"),
      "utf8",
    );
    assert.match(readiness, /write_operations: NONE/);
    assert.equal(/\/auth\/v1\/invite/.test(readiness), false);
    assert.equal(/INSERT\s+|UPDATE\s+|DELETE\s+|DROP\s+/i.test(readiness), false);

    const componentsRoot = path.join(ROOT, "src/components");
    for (const relative of fs.readdirSync(componentsRoot, {
      recursive: true,
    }) as string[]) {
      const full = path.join(componentsRoot, relative);
      if (!/\.[jt]sx?$/.test(relative) || !fs.statSync(full).isFile()) continue;
      const src = fs.readFileSync(full, "utf8");
      assert.equal(/SUPABASE_SECRET_KEY/.test(src), false);
      assert.equal(/AUTH_REAL_INVITE_CONFIRM/.test(src), false);
    }
  });
});
