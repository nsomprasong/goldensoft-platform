import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { SqlQuery } from "../scripts/db-preflight";
import {
  EXPECTED_INVITATION_STATUS_CODES,
  EXPECTED_PLATFORM_TABLE_COUNT,
  INVITATION_MIGRATION_NAME,
  INVITATION_TABLES,
  MASTER_TABLES,
  PHASE7_MIGRATION_NAME,
  PHASE7_TABLES,
  PHASE7B_HISTORY_MIGRATION_NAME,
  PHASE7B_HISTORY_TABLES,
  verifyPlatformDatabase,
} from "../scripts/db-verify";

const PROJECT_ROOT = path.resolve(process.cwd());

type MigrationAttemptCounts = {
  applied_count: number;
  rolled_back_count: number;
  unresolved_count: number;
};

describe("db:verify read-only checks", () => {
  function mockQuery(options: {
    connected?: boolean;
    migration0001?: MigrationAttemptCounts;
    migration0003?: MigrationAttemptCounts;
    migration0004?: MigrationAttemptCounts;
    migration0005?: MigrationAttemptCounts;
    migrationsTableMissing?: boolean;
    platformTableCount?: number;
    invitationTableCount?: number;
    phase7TableCount?: number;
    phase7bTableCount?: number;
    invitationStatusCount?: number;
    masterCounts?: Record<string, number>;
    organizationCount?: number;
  }): SqlQuery {
    const connected = options.connected ?? true;
    const platformTableCount =
      options.platformTableCount ?? EXPECTED_PLATFORM_TABLE_COUNT;
    const invitationTableCount =
      options.invitationTableCount ?? INVITATION_TABLES.length;
    const phase7TableCount =
      options.phase7TableCount ?? PHASE7_TABLES.length;
    const phase7bTableCount =
      options.phase7bTableCount ?? PHASE7B_HISTORY_TABLES.length;
    const invitationStatusCount =
      options.invitationStatusCount ?? EXPECTED_INVITATION_STATUS_CODES.length;
    const organizationCount = options.organizationCount ?? 2;
    const masterCounts = options.masterCounts ?? Object.fromEntries(
      MASTER_TABLES.map((table) => [table, 1]),
    );
    const migration0001 = options.migration0001 ?? {
      applied_count: 1,
      rolled_back_count: 0,
      unresolved_count: 0,
    };
    const migration0003 = options.migration0003 ?? {
      applied_count: 1,
      rolled_back_count: 0,
      unresolved_count: 0,
    };
    const migration0004 = options.migration0004 ?? {
      applied_count: 1,
      rolled_back_count: 0,
      unresolved_count: 0,
    };
    const migration0005 = options.migration0005 ?? {
      applied_count: 1,
      rolled_back_count: 0,
      unresolved_count: 0,
    };

    return async (text, values) => {
      if (text.includes("SELECT 1::int")) {
        return {
          rows: connected ? [{ ok: 1 }] : [{ ok: 0 }],
          rowCount: 1,
        };
      }

      if (text.includes("pg_catalog.pg_class")) {
        if (options.migrationsTableMissing) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [{ schema_name: "public", table_name: "_prisma_migrations" }],
          rowCount: 1,
        };
      }

      if (text.includes("applied_count") && text.includes("WHERE migration_name = $1")) {
        const migrationName = String(values?.[0] ?? "");
        const counts =
          migrationName === PHASE7B_HISTORY_MIGRATION_NAME
            ? migration0005
            : migrationName === PHASE7_MIGRATION_NAME
              ? migration0004
              : migrationName === INVITATION_MIGRATION_NAME
                ? migration0003
                : migration0001;
        return {
          rows: [
            {
              ...counts,
              total_count:
                counts.applied_count +
                counts.rolled_back_count +
                counts.unresolved_count,
            },
          ],
          rowCount: 1,
        };
      }

      if (
        text.includes("information_schema.tables") &&
        text.includes("table_name = ANY($1::text[])")
      ) {
        const names = (values?.[0] as string[] | undefined) ?? [];
        const count = names.includes(PHASE7B_HISTORY_TABLES[0])
          ? phase7bTableCount
          : names.includes(PHASE7_TABLES[0])
            ? phase7TableCount
            : invitationTableCount;
        return {
          rows: [{ count }],
          rowCount: 1,
        };
      }

      if (text.includes("information_schema.tables")) {
        return {
          rows: [{ count: platformTableCount }],
          rowCount: 1,
        };
      }

      if (
        text.includes('"platform"."user_invitation_statuses"') &&
        text.includes('"code" = ANY($1::text[])')
      ) {
        return {
          rows: [{ count: invitationStatusCount }],
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

  it("expects platform table count 64 after migration 0006", () => {
    assert.equal(EXPECTED_PLATFORM_TABLE_COUNT, 64);
    assert.ok(MASTER_TABLES.includes("user_invitation_statuses"));
    assert.ok(MASTER_TABLES.includes("entitlement_statuses"));
    assert.ok(MASTER_TABLES.includes("organization_onboarding_statuses"));
    assert.ok(MASTER_TABLES.includes("subscription_change_types"));
    assert.deepEqual([...INVITATION_TABLES], [
      "user_invitation_statuses",
      "user_invitations",
    ]);
    assert.equal(PHASE7_TABLES.length, 6);
    assert.equal(PHASE7B_HISTORY_TABLES.length, 2);
    assert.equal(EXPECTED_INVITATION_STATUS_CODES.length, 7);
  });

  it("passes when a single applied migration 0003 row exists", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 1,
          rolled_back_count: 0,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, true);
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, true);
    assert.equal(migration?.count, 1);
    assert.match(migration?.detail ?? "", /successful=1/);
  });

  it("passes when rolled-back history exists with a newer applied row", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 1,
          rolled_back_count: 2,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, true);
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, true);
    assert.equal(migration?.count, 1);
    assert.equal(
      migration?.detail,
      "successful=1;rolled_back=2;unresolved=0",
    );
  });

  it("fails when only rolled-back migration 0003 rows exist", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 0,
          rolled_back_count: 1,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, false);
    assert.equal(migration?.count, 0);
    assert.equal(migration?.detail, "rolled_back");
  });

  it("fails when unresolved failed row exists without an applied row", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 0,
          rolled_back_count: 0,
          unresolved_count: 1,
        },
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, false);
    assert.equal(migration?.detail, "not_finished");
  });

  it("reports attempt counts when applied row coexists with rolled-back history", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 1,
          rolled_back_count: 1,
          unresolved_count: 0,
        },
      }),
    );
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, true);
    assert.equal(migration?.count, 1);
    assert.equal(
      migration?.detail,
      "successful=1;rolled_back=1;unresolved=0",
    );
  });

  it("passes when connection, migrations, tables, masters, and orgs are present", async () => {
    const result = await verifyPlatformDatabase(mockQuery({}));
    assert.equal(result.ok, true);
    assert.equal(result.checks.every((c) => c.ok), true);
    const tables = result.checks.find((c) => c.name === "platform_tables");
    assert.equal(tables?.count, 64);
    assert.equal(tables?.ok, true);
    assert.equal(
      result.checks.find((c) => c.name === "invitation_statuses")?.count,
      7,
    );
    assert.equal(
      result.checks.find((c) => c.name === "invitation_tables")?.count,
      2,
    );
    assert.equal(
      result.checks.find((c) => c.name === "phase7_tables")?.count,
      6,
    );
  });

  it("passes when platform table count is 64", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({ platformTableCount: 64 }),
    );
    assert.equal(result.ok, true);
    assert.equal(
      result.checks.find((c) => c.name === "platform_tables")?.ok,
      true,
    );
  });

  it("fails when platform table count is still 49", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({ platformTableCount: 49 }),
    );
    assert.equal(result.ok, false);
    const tables = result.checks.find((c) => c.name === "platform_tables");
    assert.equal(tables?.ok, false);
    assert.equal(tables?.count, 49);
  });

  it("passes when all 7 invitation statuses are present", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({ invitationStatusCount: 7 }),
    );
    assert.equal(
      result.checks.find((c) => c.name === "invitation_statuses")?.ok,
      true,
    );
  });

  it("fails when one invitation status code is missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({ invitationStatusCount: 6 }),
    );
    assert.equal(result.ok, false);
    const statuses = result.checks.find((c) => c.name === "invitation_statuses");
    assert.equal(statuses?.ok, false);
    assert.equal(statuses?.count, 6);
  });

  it("fails when migration 0004 is missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0004: {
          applied_count: 0,
          rolled_back_count: 0,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find(
      (c) => c.name === `migration_${PHASE7_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, false);
    assert.equal(migration?.detail, "migration_missing");
  });

  it("fails when migration 0003 is missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0003: {
          applied_count: 0,
          rolled_back_count: 0,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find(
      (c) => c.name === `migration_${INVITATION_MIGRATION_NAME}`,
    );
    assert.equal(migration?.ok, false);
    assert.equal(migration?.detail, "migration_missing");
  });

  it("fails when migration is missing", async () => {
    const result = await verifyPlatformDatabase(
      mockQuery({
        migration0001: {
          applied_count: 0,
          rolled_back_count: 0,
          unresolved_count: 0,
        },
      }),
    );
    assert.equal(result.ok, false);
    const migration = result.checks.find((c) =>
      c.name.startsWith("migration_0001"),
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
    assert.equal(EXPECTED_PLATFORM_TABLE_COUNT, 64);
    assert.match(src, /0003_user_invitations/);
    assert.match(src, /0004_phase7_operations/);
    assert.match(src, /0005_phase7b_subscription_history/);
    assert.equal(/ยังไม่ apply|not yet apply/i.test(src), false);
  });
});
