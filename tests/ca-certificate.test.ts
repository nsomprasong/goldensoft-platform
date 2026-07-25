import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertCaCertificateFile,
  buildTrustedPgSsl,
  isPathInsideProjectRoot,
  loadSupabaseDbCaCertificate,
  resolveCaCertAbsolutePath,
  resolveProjectRelativePath,
} from "../src/lib/db/ca-certificate";
import { assertSafeEnvironment } from "../src/lib/env/guard";

const PROJECT_ROOT = path.resolve(process.cwd());
const CA_REL = "certs/prod-ca-2021.crt";
const NEW_REF = "horyhrnqbeaivdztekfv";
const LEGACY_REF = "invnwpyshxdadhocueeh";

const goodApi = `https://${NEW_REF}.supabase.co`;
const goodDb = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const goodDirect = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`;

describe("CA certificate + TLS guard", () => {
  it("resolves relative CA path from process.cwd() / project root", () => {
    const expected = path.resolve(process.cwd(), CA_REL);
    const viaShared = resolveProjectRelativePath(CA_REL, process.cwd());
    const viaAlias = resolveCaCertAbsolutePath(CA_REL, process.cwd());
    assert.equal(viaShared, expected);
    assert.equal(viaAlias, expected);
    assert.equal(
      viaShared,
      path.resolve(PROJECT_ROOT, "certs", "prod-ca-2021.crt"),
    );
  });

  it("does not resolve CA path into the parent of project root", () => {
    const resolved = resolveProjectRelativePath(CA_REL, PROJECT_ROOT);
    const parentCert = path.resolve(
      PROJECT_ROOT,
      "..",
      "certs",
      "prod-ca-2021.crt",
    );
    assert.notEqual(resolved, parentCert);
    assert.equal(
      resolved,
      path.join(PROJECT_ROOT, "certs", "prod-ca-2021.crt"),
    );
    assert.ok(isPathInsideProjectRoot(resolved, PROJECT_ROOT));
  });

  it("supports Windows-style relative separators after normalize", () => {
    const resolved = resolveProjectRelativePath(
      "certs\\prod-ca-2021.crt",
      PROJECT_ROOT,
    );
    assert.equal(resolved, path.resolve(PROJECT_ROOT, CA_REL));
  });

  it("does not report CA_CERT_MISSING when the certificate file exists", () => {
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
    assert.equal(
      result.ok,
      true,
      !result.ok ? `${result.code}: ${result.reason}` : "",
    );
    assertCaCertificateFile(path.resolve(PROJECT_ROOT, CA_REL));
  });

  it("loads the committed public CA certificate", () => {
    const loaded = loadSupabaseDbCaCertificate(CA_REL, PROJECT_ROOT);
    assert.ok(loaded.content.includes("BEGIN CERTIFICATE"));
    assert.equal(/PRIVATE KEY/i.test(loaded.content), false);
  });

  it("fails closed when CA file is missing", () => {
    assert.throws(
      () =>
        loadSupabaseDbCaCertificate("certs/does-not-exist.crt", PROJECT_ROOT),
      /does not exist/i,
    );

    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: "certs/does-not-exist.crt",
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CA_CERT_MISSING");
  });

  it("rejects empty CA certificate files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-ca-empty-"));
    try {
      const rel = "empty.crt";
      fs.writeFileSync(path.join(dir, rel), "", "utf8");
      assert.throws(() => loadSupabaseDbCaCertificate(rel, dir), /empty/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a directory path as CA certificate", () => {
    assert.throws(
      () => assertCaCertificateFile(path.join(PROJECT_ROOT, "certs")),
      /not a file/i,
    );

    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: goodDirect,
      caCertPath: "certs",
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CA_CERT_INVALID");
  });

  it("rejects path traversal in CA path", () => {
    assert.throws(
      () => resolveProjectRelativePath("../certs/prod-ca-2021.crt", PROJECT_ROOT),
      /traversal|outside/i,
    );
  });

  it("rejects absolute paths outside the project root", () => {
    const outside = path.join(os.tmpdir(), "outside-ca.crt");
    assert.throws(
      () => resolveProjectRelativePath(outside, PROJECT_ROOT),
      /outside/i,
    );
  });

  it("buildTrustedPgSsl always sets rejectUnauthorized true", () => {
    const loaded = loadSupabaseDbCaCertificate(CA_REL, PROJECT_ROOT);
    const ssl = buildTrustedPgSsl(loaded.content);
    assert.equal(ssl.rejectUnauthorized, true);
    assert.ok(ssl.ca.length > 0);
  });

  it("rejects DATABASE_URL with sslmode", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: `${goodDb}&sslmode=require`,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "DATABASE_URL_SSL_PARAM");
  });

  it("rejects DATABASE_URL with sslrootcert", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: `${goodDb}&sslrootcert=certs/prod-ca-2021.crt`,
      directUrl: goodDirect,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "DATABASE_URL_SSL_PARAM");
  });

  it("requires DIRECT_URL sslmode=verify-full", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "DIRECT_URL_TLS");
  });

  it("validates DIRECT_URL sslrootcert path shape without requiring fs open", () => {
    // Missing file is OK for Guard — Prisma CLI opens sslrootcert later.
    // Path must still resolve inside the project (from prisma/).
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/missing.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, true);

    const outside = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../../outside.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(outside.ok, false);
    if (!outside.ok) assert.equal(outside.code, "DIRECT_URL_TLS");
  });

  it("rejects production without CA path", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      nodeEnv: "production",
      publishableKey: "pub",
      allowTestAuth: "false",
      caCertPath: "",
      projectRoot: PROJECT_ROOT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CA_CERT_MISSING");
  });

  it("source tree has no insecure TLS workarounds in db/env modules", () => {
    const files = [
      path.join(PROJECT_ROOT, "src/lib/db/ca-certificate.ts"),
      path.join(PROJECT_ROOT, "src/lib/prisma.ts"),
      path.join(PROJECT_ROOT, "src/lib/env/guard.ts"),
      path.join(PROJECT_ROOT, "scripts/db-preflight.ts"),
    ];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      assert.equal(/rejectUnauthorized\s*:\s*false/.test(src), false, file);
      assert.equal(
        /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0/.test(src),
        false,
        file,
      );
    }
  });
});
