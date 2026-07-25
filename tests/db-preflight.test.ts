import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildDatabasePoolConfig,
  buildTrustedPgSsl,
  loadSupabaseDbCaCertificate,
} from "../src/lib/db/ca-certificate";
import { assertSafeEnvironment } from "../src/lib/env/guard";

const PROJECT_ROOT = path.resolve(process.cwd());
const CA_REL = "certs/prod-ca-2021.crt";
const NEW_REF = "horyhrnqbeaivdztekfv";
const LEGACY_REF = "invnwpyshxdadhocueeh";

const goodApi = `https://${NEW_REF}.supabase.co`;
const goodDb = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const goodDirect = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`;

describe("db:preflight connection source", () => {
  it("builds Pool config from DATABASE_URL only", () => {
    const { content } = loadSupabaseDbCaCertificate(CA_REL, PROJECT_ROOT);
    const ssl = buildTrustedPgSsl(content);
    const config = buildDatabasePoolConfig(goodDb, ssl, { max: 1 });

    assert.equal(config.connectionString, goodDb);
    assert.notEqual(config.connectionString, goodDirect);
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.ok(config.ssl.ca.includes("BEGIN CERTIFICATE"));
  });

  it("preflight script wires Pool to DATABASE_URL, not DIRECT_URL", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/db-preflight.ts"),
      "utf8",
    );
    assert.match(src, /buildDatabasePoolConfig\(\s*databaseUrl/);
    assert.equal(/connectionString:\s*directUrl/.test(src), false);
    assert.equal(/new\s+Pool\(\s*\{\s*connectionString:\s*directUrl/.test(src), false);
    assert.equal(/new\s+Client\(\s*\{\s*connectionString:\s*directUrl/.test(src), false);
    assert.match(src, /Pool connection source: DATABASE_URL/);
  });

  it("preflight does not open DIRECT_URL sslrootcert via fs", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/db-preflight.ts"),
      "utf8",
    );
    assert.equal(/sslrootcert/.test(src), false);
    assert.equal(/readFileSync\([^)]*direct/i.test(src), false);
    assert.equal(/resolveDirectSslRootCertPath/.test(src), false);
  });

  it("rejects DATABASE_URL sslmode / sslrootcert via environment guard", () => {
    const withSslMode = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: `${goodDb}&sslmode=require`,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(withSslMode.ok, false);
    if (!withSslMode.ok) assert.equal(withSslMode.code, "DATABASE_URL_SSL_PARAM");

    const withRootCert = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: `${goodDb}&sslrootcert=certs/prod-ca-2021.crt`,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(withRootCert.ok, false);
    if (!withRootCert.ok) {
      assert.equal(withRootCert.code, "DATABASE_URL_SSL_PARAM");
    }
  });

  it("still validates DIRECT_URL verify-full without connecting", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, true);

    const missingMode = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(missingMode.ok, false);
    if (!missingMode.ok) assert.equal(missingMode.code, "DIRECT_URL_TLS");
  });
});
