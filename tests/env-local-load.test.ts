import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadEnvConfig } from "@next/env";

import { loadProjectEnv } from "../scripts/load-project-env";
import {
  assertSafeEnvironment,
  extractSupabaseProjectRef,
} from "../src/lib/env/guard";

const NEW_REF = "horyhrnqbeaivdztekfv";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CA_REL = "certs/prod-ca-2021.crt";

describe("loadEnvConfig for .env.local", () => {
  it("loads APP_CODE=PLATFORM from .env.local", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-env-local-"));
    try {
      fs.writeFileSync(path.join(dir, ".env.local"), "APP_CODE=PLATFORM\n", "utf8");

      const previous = process.env.APP_CODE;
      delete process.env.APP_CODE;

      loadEnvConfig(dir, true, undefined, true);

      assert.equal(process.env.APP_CODE, "PLATFORM");

      if (previous === undefined) {
        delete process.env.APP_CODE;
      } else {
        process.env.APP_CODE = previous;
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("loadProjectEnv for CLI scripts", () => {
  it("loads .env.local before Environment Guard and wins over ambient stubs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-load-project-env-"));
    const previous = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      APP_CODE: process.env.APP_CODE,
      SUPABASE_DB_CA_CERT_PATH: process.env.SUPABASE_DB_CA_CERT_PATH,
    };

    try {
      // Ambient stubs that cannot resolve a real project ref / would poison the guard.
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://invalid-stub.example";
      process.env.DATABASE_URL = "file:./dev.db";
      process.env.DIRECT_URL = "not-a-postgres-url";
      delete process.env.APP_CODE;
      delete process.env.SUPABASE_DB_CA_CERT_PATH;

      const databaseUrl = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
      const directUrl = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`;

      fs.mkdirSync(path.join(dir, "certs"), { recursive: true });
      fs.copyFileSync(
        path.join(PROJECT_ROOT, CA_REL),
        path.join(dir, CA_REL),
      );

      fs.writeFileSync(
        path.join(dir, ".env.local"),
        [
          "APP_CODE=PLATFORM",
          `NEXT_PUBLIC_SUPABASE_URL="https://${NEW_REF}.supabase.co"`,
          `DATABASE_URL="${databaseUrl}"`,
          `DIRECT_URL="${directUrl}"`,
          `SUPABASE_DB_CA_CERT_PATH=${CA_REL}`,
          "",
        ].join("\n"),
        "utf8",
      );

      loadProjectEnv(dir);

      assert.equal(process.env.APP_CODE, "PLATFORM");
      assert.equal(
        extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        NEW_REF,
      );
      assert.match(process.env.DATABASE_URL ?? "", new RegExp(NEW_REF));
      assert.match(process.env.DIRECT_URL ?? "", new RegExp(NEW_REF));
      assert.match(
        process.env.DIRECT_URL ?? "",
        /sslmode=verify-full/,
        "DIRECT_URL from .env.local must keep TLS query after ambient stub override",
      );

      // Resolve CA / sslrootcert against the real project root (same as CLI scripts).
      const guard = assertSafeEnvironment({
        appCode: "PLATFORM",
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        databaseUrl: process.env.DATABASE_URL,
        directUrl: process.env.DIRECT_URL,
        caCertPath: CA_REL,
        projectRoot: PROJECT_ROOT,
        expectedProjectRef: NEW_REF,
        blockedLegacyProjectRef: "invnwpyshxdadhocueeh",
      });
      assert.equal(
        guard.ok,
        true,
        guard.ok ? undefined : `guard failed: ${guard.code} ${guard.reason}`,
      );
      if (guard.ok) {
        assert.equal(guard.projectRef, NEW_REF);
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("org bootstrap and verify scripts load env before static env consumers", () => {
    const bootstrapSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/bootstrap-goldensoft-organization.ts"),
      "utf8",
    );
    const verifySrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/verify-goldensoft-organization.ts"),
      "utf8",
    );
    const loadSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/load-project-env.ts"),
      "utf8",
    );
    const preflightSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/db-preflight.ts"),
      "utf8",
    );

    for (const src of [bootstrapSrc, verifySrc]) {
      assert.match(src, /loadProjectEnv/);
      assert.match(src, /await import\(["'].*load-project-env["']\)/);
      assert.match(src, /await import\(\s*["'][^"']*env\/guard["']\s*\)/);
      // No top-level static import of guard / Prisma / bootstrap logic.
      assert.equal(
        /^import\s+\{[^}]*assertSafeEnvironment/m.test(src),
        false,
      );
      assert.equal(/^import\s+.*from\s+["']@prisma\/client["']/m.test(src), false);
      assert.equal(
        /^import\s+.*from\s+["'][^"']*bootstrap-organization["']/m.test(src),
        false,
      );
      // Must not log secret values / raw connection strings.
      assert.equal(/console\.(log|error)\(\s*process\.env\./.test(src), false);
      assert.equal(/console\.(log|error)\(\s*(databaseUrl|directUrl)\s*\)/.test(src), false);
    }

    assert.match(loadSrc, /PROJECT_URL_KEYS/);
    assert.match(loadSrc, /PRESERVED_SHELL_KEYS|BOOTSTRAP_CONFIRM/);
    assert.match(loadSrc, /loadEnvConfig/);
    assert.match(loadSrc, /parseEnv|parse as parseEnv/);
    assert.match(loadSrc, /\.env\.local/);
    assert.match(loadSrc, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(loadSrc, /DATABASE_URL/);
    assert.match(loadSrc, /DIRECT_URL/);

    assert.match(preflightSrc, /loadProjectEnv/);
    assert.match(verifySrc, /Write operations: NONE/);
  });

  it("preserves BOOTSTRAP_* shell values after loadProjectEnv", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-bootstrap-shell-"));
    const previous = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      BOOTSTRAP_AUTH_USER_ID: process.env.BOOTSTRAP_AUTH_USER_ID,
      BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
      BOOTSTRAP_ADMIN_DISPLAY_NAME: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME,
      BOOTSTRAP_ORGANIZATION_CODE: process.env.BOOTSTRAP_ORGANIZATION_CODE,
      BOOTSTRAP_BRANCH_CODE: process.env.BOOTSTRAP_BRANCH_CODE,
      BOOTSTRAP_CONFIRM: process.env.BOOTSTRAP_CONFIRM,
    };

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://invalid-stub.example";
      process.env.DATABASE_URL = "file:./dev.db";
      process.env.DIRECT_URL = "not-a-postgres-url";
      process.env.BOOTSTRAP_AUTH_USER_ID =
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      process.env.BOOTSTRAP_ADMIN_EMAIL = "shell-admin@example.com";
      process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME = "จาก PowerShell";
      process.env.BOOTSTRAP_ORGANIZATION_CODE = "GOLDENSOFT";
      process.env.BOOTSTRAP_BRANCH_CODE = "GOLDENSOFT-01";
      process.env.BOOTSTRAP_CONFIRM = "CREATE_FIRST_SUPER_ADMIN";

      const databaseUrl = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
      const directUrl = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`;

      fs.writeFileSync(
        path.join(dir, ".env.local"),
        [
          "APP_CODE=PLATFORM",
          `NEXT_PUBLIC_SUPABASE_URL="https://${NEW_REF}.supabase.co"`,
          `DATABASE_URL="${databaseUrl}"`,
          `DIRECT_URL="${directUrl}"`,
          // File values that must NOT replace shell bootstrap inputs.
          "BOOTSTRAP_AUTH_USER_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "BOOTSTRAP_ADMIN_EMAIL=from-file@example.com",
          "BOOTSTRAP_CONFIRM=FROM_FILE",
          "",
        ].join("\n"),
        "utf8",
      );

      loadProjectEnv(dir);

      assert.equal(
        extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        NEW_REF,
      );
      assert.equal(
        process.env.BOOTSTRAP_AUTH_USER_ID,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      assert.equal(process.env.BOOTSTRAP_ADMIN_EMAIL, "shell-admin@example.com");
      assert.equal(process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME, "จาก PowerShell");
      assert.equal(process.env.BOOTSTRAP_ORGANIZATION_CODE, "GOLDENSOFT");
      assert.equal(process.env.BOOTSTRAP_BRANCH_CODE, "GOLDENSOFT-01");
      assert.equal(process.env.BOOTSTRAP_CONFIRM, "CREATE_FIRST_SUPER_ADMIN");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("auth bootstrap and verify scripts load env before static env consumers", () => {
    const bootstrapSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/bootstrap-first-super-admin.ts"),
      "utf8",
    );
    const verifySrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/verify-first-super-admin.ts"),
      "utf8",
    );

    for (const src of [bootstrapSrc, verifySrc]) {
      assert.match(src, /loadProjectEnv/);
      assert.match(src, /await import\(["'].*load-project-env["']\)/);
      assert.match(src, /await import\(\s*["'][^"']*env\/guard["']\s*\)/);
      assert.equal(
        /^import\s+\{[^}]*assertSafeEnvironment/m.test(src),
        false,
      );
      assert.equal(/^import\s+.*from\s+["']@prisma\/client["']/m.test(src), false);
      assert.equal(
        /^import\s+.*from\s+["'][^"']*bootstrap-first-admin["']/m.test(src),
        false,
      );
      assert.equal(/console\.(log|error)\(\s*process\.env\./.test(src), false);
      assert.equal(
        /console\.(log|error)\(\s*(databaseUrl|directUrl|secretKey)\s*\)/.test(
          src,
        ),
        false,
      );
    }

    assert.match(verifySrc, /Write operations: NONE/);
  });
});
