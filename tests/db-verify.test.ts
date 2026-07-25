import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { SqlQuery } from "../scripts/db-preflight";
import { PLATFORM_MIGRATION_NAME } from "../scripts/db-preflight";
import {
  EXPECTED_PLATFORM_TABLE_COUNT,
  MASTER_TABLES,
  verifyPlatformDatabase,
} from "../scripts/db-verify";

const PROJECT_ROOT = path.resolve(process.cwd());

describe("db:verify read-only checks", () => {
  function mockQuery(options: {
    connected?: boolean;
    migrationApplied?: boolean;
    migrationReason?: string;
    platformTableCount?: number;
    masterCounts?: Record<string, number>;
    organizationCount?: number;
  }): SqlQuery {
    const connected = options.connected ?? true;
    const migrationApplied = options.migrationApplied ?? true;
    const platformTableCount =
      options.platformTableCount ?? EXPECTED_PLATFORM_TABLE_COUNT;
    const organizationCount = options.organizationCount ?? 2;
    const masterCounts = options.masterCounts ?? Object.fromEntries(
      MASTER_TABLES.map((table) => [table, 1]),
    );

    return async (text, values) => {
      if (text.includes("SELECT 1::int")) {
        return {
          rows: connected ? [{ ok: 1 }] : [{ ok: 0 }],
          rowCount: 1,
        };
      }

      if (text.includes("pg_catalog.pg_class")) {
        if (!migrationApplied && options.migrationReason === "table_missing") {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
          rowCount: 1,
        };
      }

      if (text.includes("WHERE migration_name = $1")) {
        if (!migrationApplied) {
          if (options.migrationReason === "rolled_back") {
            return {
              rows: [
                {
                  migration_name: values?.[0],
                  finished_at: new Date(),
                  rolled_back_at: new Date(),
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              migration_name: values?.[0] ?? PLATFORM_MIGRATION_NAME,
              finished_at: new Date(),
              rolled_back_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes("information_schema.tables")) {
        return {
          rows: [{ count: platformTableCount }],
          rowCount: 1,
        };
      }

      if (text.includes('"platform"."organizations"')) {
        return {
          rows: [{ count: organizationCount }],
          rowCount: 1,
        };
      }

      const masterMatch = text.match(
        /FROM "platform"\."([A-Za-z0-9_]+)"/,
      );
      if (masterMatch?.[1]) {
        const table = masterMatch[1];
        return {
          rows: [{ count: masterCounts[table] ?? 0 }],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected query in test: ${text.slice(0, 100)}`);
    };
  }

  it("passes when connection, migration, tables, masters, and orgs are present", async () => {
    const result = await verifyPlatformDatabase(mockQuery({}));
    assert.equal(result.ok, true);
    assert.equal(result.checks.every((c) => c.ok), true);
    const tables = result.checks.find((c) => c.name === "platform_tables");
    assert.equal(tables?.count, EXPECTED_PLATFORM_TABLE_COUNT);
  });

  it("fails when migration is missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migrationApplied: false,
        migrationReason: "migration_missing",
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find((c) =>
      c.name.startsWith("migration_"),
    );
    assert.equal(migration?.ok, false);
  });

  it("fails when master tables have no data", async () => {
    const masterCounts = Object.fromEntries(
      MASTER_TABLES.map((table) => [table, 0]),
    );
    const result = await verifyPlatformDatabase(
      mockQuery({ masterCounts }),
    );
    assert.equal(result.ok, false);
    const masters = result.checks.find(
      (c) => c.name === "master_tables_with_data",
    );
    assert.equal(masters?.ok, false);
    assert.equal(masters?.count, 0);
  });

  it("fails when demo organizations are missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({ organizationCount: 0 }),
    );
    assert.equal(result.ok, false);
    const orgs = result.checks.find((c) => c.name === "demo_organizations");
    assert.equal(orgs?.ok, false);
    assert.equal(orgs?.count, 0);
  });

  it("script is read-only and uses DATABASE_URL with trusted SSL", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/db-verify.ts"),
      "utf8",
    );
    assert.match(src, /buildDatabasePoolConfig/);
    assert.match(src, /buildTrustedPgSsl/);
    assert.match(src, /loadSupabaseDbCaCertificate/);
    assert.equal(/INSERT\s+|UPDATE\s+|DELETE\s+|DROP\s+/i.test(src), false);
    assert.equal(/connectionString:\s*directUrl/.test(src), false);
    assert.equal(/DIRECT_URL/.test(src), false);
  });
});
