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
import {
  checkPlatformMigrationApplied,
  PLATFORM_MIGRATION_NAME,
  type SqlQuery,
} from "../scripts/db-preflight";

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

describe("Platform migration applied detection", () => {
  function mockQuery(handlers: {
    locateRows?: Array<Record<string, unknown>>;
    migrationRows?: Array<Record<string, unknown>>;
    migrationCounts?: {
      applied_count?: number;
      rolled_back_count?: number;
      unresolved_count?: number;
      total_count?: number;
    };
  }): SqlQuery {
    return async (text) => {
      if (text.includes("pg_catalog.pg_class")) {
        const rows = handlers.locateRows ?? [];
        return { rows, rowCount: rows.length };
      }
      if (text.includes("applied_count") || text.includes("migration_name")) {
        if (handlers.migrationCounts) {
          const counts = handlers.migrationCounts;
          const row = {
            applied_count: counts.applied_count ?? 0,
            rolled_back_count: counts.rolled_back_count ?? 0,
            unresolved_count: counts.unresolved_count ?? 0,
            total_count:
              counts.total_count ??
              (counts.applied_count ?? 0) +
                (counts.rolled_back_count ?? 0) +
                (counts.unresolved_count ?? 0),
          };
          return { rows: [row], rowCount: 1 };
        }
        // Derive aggregate counts from legacy row fixtures used by older tests.
        const rows = handlers.migrationRows ?? [];
        let applied_count = 0;
        let rolled_back_count = 0;
        let unresolved_count = 0;
        for (const row of rows) {
          if (row.rolled_back_at != null) {
            rolled_back_count += 1;
          } else if (row.finished_at == null) {
            unresolved_count += 1;
          } else {
            applied_count += 1;
          }
        }
        return {
          rows: [
            {
              applied_count,
              rolled_back_count,
              unresolved_count,
              total_count: rows.length,
            },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query in test: ${text.slice(0, 80)}`);
    };
  }

  it("reports applied when finished migration exists in catalog schema", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({
        locateRows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
        migrationRows: [
          {
            migration_name: PLATFORM_MIGRATION_NAME,
            finished_at: new Date("2026-07-25T00:00:00Z"),
            rolled_back_at: null,
          },
        ],
      }),
    );
    assert.equal(status.applied, true);
    assert.equal(status.schema, "public");
    assert.equal(status.reason, "applied");
    assert.equal(status.appliedCount, 1);
  });

  it("reports applied when rolled-back history exists alongside a successful attempt", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({
        locateRows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
        migrationCounts: {
          applied_count: 1,
          rolled_back_count: 1,
          unresolved_count: 0,
          total_count: 2,
        },
      }),
    );
    assert.equal(status.applied, true);
    assert.equal(status.reason, "applied");
    assert.equal(status.appliedCount, 1);
    assert.equal(status.rolledBackCount, 1);
    assert.equal(status.unresolvedCount, 0);
  });

  it("reports not applied when _prisma_migrations table is missing", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({ locateRows: [] }),
    );
    assert.equal(status.applied, false);
    assert.equal(status.reason, "table_missing");
  });

  it("reports not applied when migration row is missing", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({
        locateRows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
        migrationRows: [],
      }),
    );
    assert.equal(status.applied, false);
    assert.equal(status.reason, "migration_missing");
  });

  it("reports not applied when finished_at is null", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({
        locateRows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
        migrationRows: [
          {
            migration_name: PLATFORM_MIGRATION_NAME,
            finished_at: null,
            rolled_back_at: null,
          },
        ],
      }),
    );
    assert.equal(status.applied, false);
    assert.equal(status.reason, "not_finished");
    assert.equal(status.unresolvedCount, 1);
  });

  it("reports not applied when migration was rolled back", async () => {
    const status = await checkPlatformMigrationApplied(
      mockQuery({
        locateRows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
        migrationRows: [
          {
            migration_name: PLATFORM_MIGRATION_NAME,
            finished_at: new Date("2026-07-25T00:00:00Z"),
            rolled_back_at: new Date("2026-07-25T01:00:00Z"),
          },
        ],
      }),
    );
    assert.equal(status.applied, false);
    assert.equal(status.reason, "rolled_back");
    assert.equal(status.rolledBackCount, 1);
    assert.equal(status.appliedCount, 0);
  });

  it("preflight uses catalog lookup instead of assuming platform schema", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/db-preflight.ts"),
      "utf8",
    );
    assert.match(src, /pg_catalog\.pg_class/);
    assert.match(src, /checkPlatformMigrationApplied/);
    assert.match(src, /applied_count/);
    assert.match(src, /COUNT\(\*\) FILTER/);
    assert.equal(/WHERE migration_name = \$1\s+LIMIT 1/i.test(src), false);
    assert.equal(
      /table_schema\s*=\s*'platform'\s+and\s+table_name\s*=\s*'_prisma_migrations'/i.test(
        src,
      ),
      false,
    );
  });
});

