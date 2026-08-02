import {
  checkPlatformMigrationApplied,
  PLATFORM_MIGRATION_NAME,
  type SqlQuery,
} from "./db-preflight";

// Env is loaded by the db-preflight import (project files win over ambient stubs).

// 64 after 0006, +1 staff_organization_assignments (0007),
// +1 user_password_resets (0008), +1 staff_profiles (0009),
// +1 platform_role_permissions (0012), +1 system_settings (0013).
// 0011/0014 alter existing tables only.
export const EXPECTED_PLATFORM_TABLE_COUNT = 69;

export const INVITATION_MIGRATION_NAME = "0003_user_invitations";

export const PHASE7_MIGRATION_NAME = "0004_phase7_operations";

export const PHASE7B_HISTORY_MIGRATION_NAME = "0005_phase7b_subscription_history";

export const BILLING_MIGRATION_NAME = "0006_billing_credit_foundation";

export const INVITATION_TABLES = [
  "user_invitation_statuses",
  "user_invitations",
] as const;

export const PHASE7_TABLES = [
  "permissions",
  "organization_role_permissions",
  "entitlement_statuses",
  "entitlements",
  "organization_onboarding_statuses",
  "organization_onboardings",
] as const;

export const PHASE7B_HISTORY_TABLES = [
  "subscription_change_types",
  "subscription_histories",
] as const;

export const BILLING_TABLES = [
  "billing_account_statuses",
  "credit_transaction_types",
  "credit_directions",
  "invoice_statuses",
  "payment_statuses",
  "payment_methods",
  "billing_accounts",
  "credit_transactions",
  "invoices",
  "invoice_items",
  "payments",
  "payment_allocations",
  "billing_contacts",
] as const;

export const EXPECTED_INVITATION_STATUS_CODES = [
  "PENDING",
  "AUTH_SENT",
  "COMPLETED",
  "FAILED",
  "PLATFORM_SETUP_FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

/** Master / lookup tables seeded by prisma/seed-masters.ts (includes 0003). */
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
  "user_invitation_statuses",
  "entitlement_statuses",
  "organization_onboarding_statuses",
  "subscription_change_types",
  "billing_account_statuses",
  "credit_transaction_types",
  "credit_directions",
  "invoice_statuses",
  "payment_statuses",
  "payment_methods",
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

async function countNamedPlatformTables(
  query: SqlQuery,
  tableNames: readonly string[],
): Promise<number> {
  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'platform'
      AND table_type = 'BASE TABLE'
      AND table_name = ANY($1::text[])
    `,
    [tableNames as unknown as string[]],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countInvitationTables(query: SqlQuery): Promise<number> {
  return countNamedPlatformTables(query, INVITATION_TABLES);
}

async function countPhase7Tables(query: SqlQuery): Promise<number> {
  return countNamedPlatformTables(query, PHASE7_TABLES);
}

async function countPhase7bHistoryTables(query: SqlQuery): Promise<number> {
  return countNamedPlatformTables(query, PHASE7B_HISTORY_TABLES);
}

async function countBillingTables(query: SqlQuery): Promise<number> {
  return countNamedPlatformTables(query, BILLING_TABLES);
}

async function countInvitationStatuses(query: SqlQuery): Promise<number> {
  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM "platform"."user_invitation_statuses"
    WHERE "code" = ANY($1::text[])
    `,
    [EXPECTED_INVITATION_STATUS_CODES as unknown as string[]],
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
    count: migration.appliedCount,
    detail: migration.applied ? undefined : migration.reason,
  });

  const migration0003 = await checkPlatformMigrationApplied(
    query,
    INVITATION_MIGRATION_NAME,
  );
  const invitationTableCount = await countInvitationTables(query);
  const migration0003SchemaOk =
    !migration0003.applied ||
    invitationTableCount === INVITATION_TABLES.length;
  const migration0003Ok = migration0003.applied && migration0003SchemaOk;
  const migration0003Detail = migration0003Ok
    ? `successful=${migration0003.appliedCount};rolled_back=${migration0003.rolledBackCount};unresolved=${migration0003.unresolvedCount}`
    : !migration0003SchemaOk
      ? "schema_inconsistent"
      : migration0003.reason;
  checks.push({
    name: `migration_${INVITATION_MIGRATION_NAME}`,
    ok: migration0003Ok,
    count: migration0003.appliedCount,
    detail: migration0003Detail,
  });

  const migration0004 = await checkPlatformMigrationApplied(
    query,
    PHASE7_MIGRATION_NAME,
  );
  const phase7TableCount = await countPhase7Tables(query);
  const migration0004SchemaOk =
    !migration0004.applied || phase7TableCount === PHASE7_TABLES.length;
  const migration0004Ok = migration0004.applied && migration0004SchemaOk;
  const migration0004Detail = migration0004Ok
    ? `successful=${migration0004.appliedCount};rolled_back=${migration0004.rolledBackCount};unresolved=${migration0004.unresolvedCount}`
    : !migration0004SchemaOk
      ? "schema_inconsistent"
      : migration0004.reason;
  checks.push({
    name: `migration_${PHASE7_MIGRATION_NAME}`,
    ok: migration0004Ok,
    count: migration0004.appliedCount,
    detail: migration0004Detail,
  });

  const migration0005 = await checkPlatformMigrationApplied(
    query,
    PHASE7B_HISTORY_MIGRATION_NAME,
  );
  const phase7bTableCount = await countPhase7bHistoryTables(query);
  const migration0005SchemaOk =
    !migration0005.applied ||
    phase7bTableCount === PHASE7B_HISTORY_TABLES.length;
  const migration0005Ok = migration0005.applied && migration0005SchemaOk;
  const migration0005Detail = migration0005Ok
    ? `successful=${migration0005.appliedCount};rolled_back=${migration0005.rolledBackCount};unresolved=${migration0005.unresolvedCount}`
    : !migration0005SchemaOk
      ? "schema_inconsistent"
      : migration0005.reason;
  checks.push({
    name: `migration_${PHASE7B_HISTORY_MIGRATION_NAME}`,
    ok: migration0005Ok,
    count: migration0005.appliedCount,
    detail: migration0005Detail,
  });

  const migration0006 = await checkPlatformMigrationApplied(
    query,
    BILLING_MIGRATION_NAME,
  );
  const billingTableCount = await countBillingTables(query);
  const migration0006SchemaOk =
    !migration0006.applied || billingTableCount === BILLING_TABLES.length;
  const migration0006Ok = migration0006.applied && migration0006SchemaOk;
  const migration0006Detail = migration0006Ok
    ? `successful=${migration0006.appliedCount};rolled_back=${migration0006.rolledBackCount};unresolved=${migration0006.unresolvedCount}`
    : !migration0006SchemaOk
      ? "schema_inconsistent"
      : migration0006.reason;
  checks.push({
    name: `migration_${BILLING_MIGRATION_NAME}`,
    ok: migration0006Ok,
    count: migration0006.appliedCount,
    detail: migration0006Detail,
  });

  const tableCount = await countPlatformTables(query);
  checks.push({
    name: "platform_tables",
    ok: tableCount === EXPECTED_PLATFORM_TABLE_COUNT,
    count: tableCount,
  });

  checks.push({
    name: "invitation_tables",
    ok: invitationTableCount === INVITATION_TABLES.length,
    count: invitationTableCount,
  });

  checks.push({
    name: "phase7_tables",
    ok: phase7TableCount === PHASE7_TABLES.length,
    count: phase7TableCount,
  });

  checks.push({
    name: "phase7b_history_tables",
    ok: phase7bTableCount === PHASE7B_HISTORY_TABLES.length,
    count: phase7bTableCount,
  });

  checks.push({
    name: "billing_tables",
    ok: billingTableCount === BILLING_TABLES.length,
    count: billingTableCount,
  });

  const invitationStatusCount = await countInvitationStatuses(query);
  checks.push({
    name: "invitation_statuses",
    ok: invitationStatusCount === EXPECTED_INVITATION_STATUS_CODES.length,
    count: invitationStatusCount,
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
    const detailPart = check.detail ? ` (${check.detail})` : "";
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
