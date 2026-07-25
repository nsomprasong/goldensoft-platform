import {
  checkPlatformMigrationApplied,
  PLATFORM_MIGRATION_NAME,
  type SqlQuery,
} from "./db-preflight";

// Env is loaded by the db-preflight import (project files win over ambient stubs).

export const EXPECTED_PLATFORM_TABLE_COUNT = 41;

/** Master / lookup tables seeded by prisma/seed-masters.ts */
export const MASTER_TABLES = [
  "user_profile_statuses",
  "platform_roles",
  "assignment_statuses",
  "organization_statuses",
  "branch_statuses",
  "membership_statuses",
  "organization_roles",
  "branch_scope_types",
  "product_statuses",
  "feature_statuses",
  "plan_statuses",
  "plan_version_statuses",
  "billing_cycles",
  "subscription_statuses",
  "subscription_override_types",
  "product_membership_statuses",
  "outbox_event_statuses",
  "idempotency_statuses",
  "legacy_migration_statuses",
  "feature_value_types",
  "audit_action_types",
] as const;

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(ident: string): string {
  if (!SAFE_IDENT.test(ident)) {
    throw new Error(`Unsafe SQL identifier rejected: ${ident}`);
  }
  return `"${ident}"`;
}

export type VerifyCheck = {
  name: string;
  ok: boolean;
  count?: number;
  detail?: string;
};

export type VerifyResult = {
  ok: boolean;
  checks: VerifyCheck[];
};

async function countPlatformTables(query: SqlQuery): Promise<number> {
  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'platform'
      AND table_type = 'BASE TABLE'
    `,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countMasterTablesWithData(query: SqlQuery): Promise<{
  withData: number;
  total: number;
}> {
  let withData = 0;
  for (const table of MASTER_TABLES) {
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM "platform".${quoteIdent(table)}`,
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count >= 1) withData += 1;
  }
  return { withData, total: MASTER_TABLES.length };
}

async function countOrganizations(query: SqlQuery): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM "platform"."organizations"`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Read-only platform verification checks (no PII / secrets in result). */
export async function verifyPlatformDatabase(
  query: SqlQuery,
): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];

  const ping = await query("SELECT 1::int AS ok");
  const connected = Number(ping.rows[0]?.ok) === 1;
  checks.push({
    name: "database_connection",
    ok: connected,
    count: connected ? 1 : 0,
  });

  const migration = await checkPlatformMigrationApplied(query);
  checks.push({
    name: `migration_${PLATFORM_MIGRATION_NAME}`,
    ok: migration.applied,
    count: migration.applied ? 1 : 0,
    detail: migration.reason,
  });

  const tableCount = await countPlatformTables(query);
  checks.push({
    name: "platform_tables",
    ok: tableCount === EXPECTED_PLATFORM_TABLE_COUNT,
    count: tableCount,
  });

  const masters = await countMasterTablesWithData(query);
  checks.push({
    name: "master_tables_with_data",
    ok: masters.withData === masters.total,
    count: masters.withData,
    detail: `${masters.withData}/${masters.total}`,
  });

  const orgCount = await countOrganizations(query);
  checks.push({
    name: "demo_organizations",
    ok: orgCount >= 1,
    count: orgCount,
  });

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function printChecks(result: VerifyResult): void {
  for (const check of result.checks) {
    const status = check.ok ? "PASS" : "FAIL";
    const countPart =
      check.count === undefined ? "" : ` count=${check.count}`;
    const detailPart = check.detail && !check.ok ? ` (${check.detail})` : "";
    console.log(`${check.name}: ${status}${countPart}${detailPart}`);
  }
  console.log(`verify_result: ${result.ok ? "PASS" : "FAIL"}`);
}

async function main() {
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { Pool } = await import("pg");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for db:verify");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));

  try {
    const result = await verifyPlatformDatabase(async (text, values) =>
      pool.query(text, values),
    );
    printChecks(result);
    if (!result.ok) {
      process.exit(1);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/db-verify.ts");

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "db:verify failed";
    console.error(
      "db:verify failed:",
      message
        .replace(/:[^:@/]+@/g, ":***@")
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]"),
    );
    process.exit(1);
  });
}
