import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isProtectedPath, SET_PASSWORD_PATH } from "../src/lib/auth/access";
import {
  decodePasswordResetCookie,
  encodePasswordResetCookie,
} from "../src/lib/auth/password-reset-cookie";
import {
  generateUnguessablePassword,
  InMemoryStaffAuthAdapter,
  resolveStaffAuthConfig,
  StaffAuthError,
} from "../src/lib/auth/staff-auth-adapter";
import { PLATFORM_PERMISSIONS } from "../src/lib/permissions/codes";
import {
  canManageStaff,
  canResetUserPassword,
  staffCreateSchema,
  staffUpdateSchema,
  StaffAdminError,
} from "../src/lib/platform/staff";
import {
  isValidThaiNationalId,
  composeStaffDisplayName,
  formatNationalIdInput,
  formatPhoneInput,
  formatThaiDateInput,
  isNationalIdFormat,
  isPhoneFormat,
  isValidThaiPhone,
  parseThaiOrIsoDateToIso,
} from "../src/lib/platform/staff-identity";
import { planPurge, PurgeSafetyError } from "../src/lib/seed/purge-dataset";

const SECRET = "test-cookie-secret-at-least-32-chars";
const VALID_NATIONAL_ID = "1234567890121";

describe("Staff administration guards", () => {
  it("restricts staff administration to SUPER_ADMIN", () => {
    assert.equal(canManageStaff({ platformRoles: ["SUPER_ADMIN"] }), true);
    assert.equal(canManageStaff({ platformRoles: ["SALES"] }), false);
    assert.equal(canManageStaff({ platformRoles: [] }), false);
  });

  it("grants password reset only with the dedicated permission", () => {
    assert.equal(canResetUserPassword({ platformRoles: ["SUPER_ADMIN"] }), true);
    assert.equal(canResetUserPassword({ platformRoles: ["SUPPORT"] }), false);
    assert.equal(canResetUserPassword({ platformRoles: ["SALES"] }), false);
    assert.equal(
      PLATFORM_PERMISSIONS.userPasswordReset,
      "platform.user.password_reset",
    );
  });

  it("validates Thai national ID checksums used for staff identity", () => {
    assert.equal(isValidThaiNationalId(VALID_NATIONAL_ID), true);
    assert.equal(isValidThaiNationalId("1-2345-67890-12-1"), true);
    assert.equal(isValidThaiNationalId("๑๒๓๔๕๖๗๘๙๐๑๒๑"), true);
    assert.equal(isValidThaiNationalId("1234567890120"), false);
    assert.equal(isValidThaiNationalId("123"), false);
    assert.equal(formatNationalIdInput("1234567890121"), "1-2345-67890-12-1");
    assert.equal(formatNationalIdInput("12345"), "1-2345");
    assert.equal(isNationalIdFormat("1-2345-67890-12-1"), true);
    assert.equal(isNationalIdFormat("1234567890121"), false);
    assert.equal(formatPhoneInput("0812345678"), "081-234-5678");
    assert.equal(formatPhoneInput("08123"), "081-23");
    assert.equal(isPhoneFormat("081-234-5678"), true);
    assert.equal(isValidThaiPhone("0812345678"), true);
    assert.equal(isValidThaiPhone("12345"), false);
    assert.equal(formatThaiDateInput("15051990"), "15/05/1990");
    assert.equal(formatThaiDateInput("1505"), "15/05");
    assert.equal(parseThaiOrIsoDateToIso("15/05/1990"), "1990-05-15");
    assert.equal(parseThaiOrIsoDateToIso("29/07/2540"), "1997-07-29");
    assert.equal(parseThaiOrIsoDateToIso("31/02/1990"), null);
  });

  it("normalises the create payload and rejects incomplete input", () => {
    const parsed = staffCreateSchema.parse({
      email: "  Sales.One@GoldenSoft.CO.TH ",
      titleCode: "MR",
      firstNameTh: "  พนักงานขาย  ",
      lastNameTh: "  หนึ่ง  ",
      nationalId: "1-2345-67890-12-1",
      dateOfBirth: "15/05/2533",
      phone: "081-234-5678",
      roleCodes: ["SALES", "SALES"],
    });
    assert.equal(parsed.email, "sales.one@goldensoft.co.th");
    assert.equal(parsed.firstNameTh, "พนักงานขาย");
    assert.equal(parsed.lastNameTh, "หนึ่ง");
    assert.equal(parsed.nationalId, VALID_NATIONAL_ID);
    assert.equal(parsed.dateOfBirth, "1990-05-15");
    assert.equal(parsed.phone, "0812345678");
    assert.deepEqual(parsed.roleCodes, ["SALES"]);
    assert.equal(
      composeStaffDisplayName(parsed),
      "นาย พนักงานขาย หนึ่ง",
    );

    assert.equal(
      staffCreateSchema.safeParse({
        email: "not-an-email",
        titleCode: "MR",
        firstNameTh: "x",
        lastNameTh: "y",
        nationalId: VALID_NATIONAL_ID,
        dateOfBirth: "01/01/1990",
        phone: "081-234-5678",
        roleCodes: ["SALES"],
      }).success,
      false,
    );
    assert.equal(
      staffCreateSchema.safeParse({
        email: "a@b.co",
        titleCode: "MR",
        firstNameTh: "x",
        lastNameTh: "y",
        nationalId: VALID_NATIONAL_ID,
        dateOfBirth: "01/01/1990",
        phone: "081-234-5678",
        roleCodes: [],
      }).success,
      false,
    );
    assert.equal(
      staffCreateSchema.safeParse({
        email: "a@b.co",
        titleCode: "MR",
        firstNameTh: "x",
        lastNameTh: "y",
        nationalId: "1234567890120",
        dateOfBirth: "01/01/1990",
        phone: "081-234-5678",
        roleCodes: ["SALES"],
      }).success,
      false,
    );
    assert.equal(
      staffCreateSchema.safeParse({
        email: "a@b.co",
        titleCode: "MR",
        firstNameTh: "x",
        lastNameTh: "y",
        nationalId: VALID_NATIONAL_ID,
        dateOfBirth: "01/01/1990",
        roleCodes: ["SALES"],
      }).success,
      false,
    );
    assert.equal(
      staffCreateSchema.safeParse({
        email: "optional.nid@example.com",
        titleCode: "MR",
        firstNameTh: "ทดสอบ",
        lastNameTh: "ว่างบัตร",
        nationalId: "",
        dateOfBirth: "01/01/2540",
        phone: "081-234-5678",
        roleCodes: ["SALES"],
      }).success,
      true,
    );
  });

  it("requires at least one editable field on update", () => {
    assert.equal(staffUpdateSchema.safeParse({}).success, false);
    assert.equal(
      staffUpdateSchema.safeParse({ statusCode: "SUSPENDED" }).success,
      false,
    );
    assert.equal(
      staffUpdateSchema.safeParse({ statusCode: "DISABLED" }).success,
      true,
    );
    assert.equal(
      staffUpdateSchema.safeParse({ firstNameTh: "ใหม่" }).success,
      true,
    );
  });

  it("exposes StaffAdminError codes", () => {
    const error = new StaffAdminError("CONFLICT", "ซ้ำ");
    assert.equal(error.code, "CONFLICT");
    assert.equal(error.name, "StaffAdminError");
  });
});

describe("Staff auth adapter", () => {
  it("requires Supabase Admin configuration", () => {
    assert.throws(
      () => resolveStaffAuthConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }),
      (error: unknown) =>
        error instanceof StaffAuthError &&
        error.code === "STAFF_AUTH_UNAVAILABLE",
    );
  });

  it("refuses the blocked legacy Supabase project", () => {
    assert.throws(
      () =>
        resolveStaffAuthConfig({
          NEXT_PUBLIC_SUPABASE_URL: "https://invnwpyshxdadhocueeh.supabase.co",
          SUPABASE_SECRET_KEY: "secret",
        }),
      (error: unknown) =>
        error instanceof StaffAuthError &&
        error.code === "STAFF_AUTH_PROJECT_MISMATCH",
    );
  });

  it("accepts the expected project reference", () => {
    const config = resolveStaffAuthConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://horyhrnqbeaivdztekfv.supabase.co",
      SUPABASE_SECRET_KEY: "secret",
      EXPECTED_SUPABASE_PROJECT_REF: "horyhrnqbeaivdztekfv",
      BLOCKED_LEGACY_SUPABASE_PROJECT_REF: "invnwpyshxdadhocueeh",
    });
    assert.equal(config.secretKey, "secret");
  });

  it("generates distinct unguessable passwords", () => {
    const first = generateUnguessablePassword();
    const second = generateUnguessablePassword();
    assert.notEqual(first, second);
    assert.ok(first.length >= 32);
  });

  it("creates and updates users in the in-memory adapter", async () => {
    const auth = new InMemoryStaffAuthAdapter();
    assert.equal(await auth.getUserByEmail("staff@goldensoft.co.th"), null);
    const created = await auth.createUser({
      email: "Staff@GoldenSoft.co.th",
      displayName: "พนักงาน",
      password: "initial-password",
    });
    assert.equal(created.email, "staff@goldensoft.co.th");
    await auth.setPassword({
      authUserId: created.authUserId,
      password: "chosen-password",
    });
    assert.equal(auth.passwords.get(created.authUserId), "chosen-password");
    await assert.rejects(
      auth.createUser({
        email: "staff@goldensoft.co.th",
        displayName: "ซ้ำ",
        password: "x",
      }),
      (error: unknown) =>
        error instanceof StaffAuthError &&
        error.code === "STAFF_AUTH_ALREADY_EXISTS",
    );
  });
});

describe("Password reset cookie", () => {
  const withSecret = <T>(run: () => T): T => {
    const previous = process.env.PLATFORM_CONTEXT_COOKIE_SECRET;
    process.env.PLATFORM_CONTEXT_COOKIE_SECRET = SECRET;
    try {
      return run();
    } finally {
      process.env.PLATFORM_CONTEXT_COOKIE_SECRET = previous;
    }
  };

  it("round-trips a signed reset pointer", () => {
    withSecret(() => {
      const expiresAt = Date.now() + 60_000;
      const raw = encodePasswordResetCookie({ resetId: "reset-1", expiresAt });
      assert.deepEqual(decodePasswordResetCookie(raw), {
        resetId: "reset-1",
        expiresAt,
      });
    });
  });

  it("rejects tampered, expired and empty cookies", () => {
    withSecret(() => {
      const raw = encodePasswordResetCookie({
        resetId: "reset-1",
        expiresAt: Date.now() + 60_000,
      });
      const [payload] = raw.split(".");
      assert.equal(decodePasswordResetCookie(`${payload}.forged`), null);
      assert.equal(decodePasswordResetCookie(undefined), null);
      assert.equal(decodePasswordResetCookie(payload), null);

      const stale = encodePasswordResetCookie({
        resetId: "reset-1",
        expiresAt: Date.now() - 1,
      });
      assert.equal(decodePasswordResetCookie(stale), null);
    });
  });
});

describe("Set-password routing", () => {
  it("keeps the set-password screen reachable without a session", () => {
    assert.equal(SET_PASSWORD_PATH, "/auth/set-password");
    assert.equal(isProtectedPath(SET_PASSWORD_PATH), false);
    assert.equal(isProtectedPath(`/api${SET_PASSWORD_PATH}`), false);
    assert.equal(isProtectedPath("/staff"), true);
  });

  it("wires the reset flow files", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");
    for (const file of [
      "src/app/auth/set-password/page.tsx",
      "src/app/api/auth/set-password/route.ts",
      "src/app/api/platform/staff/route.ts",
      "src/app/api/platform/staff/[id]/route.ts",
      "src/app/api/platform/staff/[id]/password-reset/route.ts",
      "src/app/staff/new/page.tsx",
      "src/app/staff/[id]/edit/page.tsx",
      "src/components/staff-create-form.tsx",
      "src/components/staff-edit-form.tsx",
      "src/components/staff-identity-fields.tsx",
      "src/components/set-password-gate.tsx",
      "src/lib/auth/set-password-action.ts",
      "prisma/migrations/0008_staff_password_reset/migration.sql",
      "prisma/migrations/0009_staff_identity_profiles/migration.sql",
      "prisma/migrations/0010_staff_national_id_optional/migration.sql",
    ]) {
      assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
    }

    const loginForm = fs.readFileSync(
      path.join(root, "src/components/login-form.tsx"),
      "utf8",
    );
    // Empty password must be submittable to reach the set-password screen.
    assert.doesNotMatch(loginForm, /name="password"[\s\S]{0,120}required/);

    const migration = fs.readFileSync(
      path.join(root, "prisma/migrations/0008_staff_password_reset/migration.sql"),
      "utf8",
    );
    assert.match(migration, /user_password_resets/);
    assert.match(migration, /platform\.user\.password_reset/);

    const identityMigration = fs.readFileSync(
      path.join(root, "prisma/migrations/0009_staff_identity_profiles/migration.sql"),
      "utf8",
    );
    assert.match(identityMigration, /staff_profiles/);
    assert.match(identityMigration, /national_id/);
  });
});

describe("Tenant data purge safety", () => {
  it("requires at least one account to keep", async () => {
    await assert.rejects(
      planPurge({} as never, { keepEmails: [], keepOrganizationCodes: [] }),
      PurgeSafetyError,
    );
  });

  it("refuses to run when a kept account is missing", async () => {
    const db = {
      userProfile: { findMany: async () => [] },
    } as never;
    await assert.rejects(
      planPurge(db, {
        keepEmails: ["nsomprasong@gmail.com"],
        keepOrganizationCodes: ["GOLDENSOFT"],
      }),
      (error: unknown) =>
        error instanceof PurgeSafetyError &&
        /nsomprasong@gmail.com/.test(error.message),
    );
  });
});
