import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertSafeEnvironment,
  extractProjectRefFromConnectionString,
  extractSupabaseProjectRef,
  isTestAuthEnabled,
} from "../src/lib/env/guard";

const NEW_REF = "horyhrnqbeaivdztekfv";
const LEGACY_REF = "invnwpyshxdadhocueeh";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CA_REL = "certs/prod-ca-2021.crt";

const goodApi = `https://${NEW_REF}.supabase.co`;
const goodDb = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const goodDirect = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`;
const legacyDb = `postgresql://postgres.${LEGACY_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

describe("Environment Guard", () => {
  it("extracts project ref from Supabase URL", () => {
    assert.equal(extractSupabaseProjectRef(goodApi), NEW_REF);
  });

  it("extracts project ref from pooler connection string", () => {
    assert.equal(extractProjectRefFromConnectionString(goodDb), NEW_REF);
  });

  it("rejects Legacy project ref in Supabase URL", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: `https://${LEGACY_REF}.supabase.co`,
      databaseUrl: legacyDb,
      directUrl: `${legacyDb.replace(":6543", ":5432")}?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "LEGACY_BLOCKED");
  });

  it("rejects Legacy project ref inside DATABASE_URL", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: legacyDb,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "LEGACY_BLOCKED");
  });

  it("rejects mismatched project refs across URLs", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.otherproject:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.code === "REF_MISMATCH" ||
          result.code === "UNEXPECTED_REF" ||
          result.code === "INVALID_URL",
      );
    }
  });

  it("accepts matching new project refs", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
      allowTestAuth: "false",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.projectRef, NEW_REF);
  });

  it("blocks ALLOW_TEST_AUTH in production", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      nodeEnv: "production",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
      publishableKey: "publishable",
      allowTestAuth: "true",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEST_AUTH_IN_PRODUCTION");
  });

  it("requires publishable key in production", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      nodeEnv: "production",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
      allowTestAuth: "false",
      publishableKey: "",
      appUrl: "https://platform.goldensoft.cloud",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MISSING_PUBLISHABLE_KEY");
  });

  it("parses test auth flags", () => {
    assert.equal(isTestAuthEnabled("true"), true);
    assert.equal(isTestAuthEnabled("1"), true);
    assert.equal(isTestAuthEnabled("false"), false);
  });
});
