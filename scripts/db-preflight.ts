import { loadEnvConfig } from "@next/env";
import path from "node:path";

// Load .env.local / .env before any Environment Guard usage.
loadEnvConfig(process.cwd());

export const PLATFORM_MIGRATION_NAME = "0001_platform_initial";

export type SqlQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;

export type PlatformMigrationStatus = {
  applied: boolean;
  schema: string | null;
  reason:
    | "applied"
    | "table_missing"
    | "migration_missing"
    | "not_finished"
    | "rolled_back";
};

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(ident: string): string {
  if (!SAFE_IDENT.test(ident)) {
    throw new Error(`Unsafe SQL identifier rejected: ${ident}`);
  }
  return `"${ident}"`;
}

/** Locate `_prisma_migrations` via PostgreSQL catalog (any schema). Read-only. */
export async function locatePrismaMigrationsTable(
  query: SqlQuery,
): Promise<{ schema: string; table: string } | null> {
  const result = await query(
    `
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relname = '_prisma_migrations'
    ORDER BY
      CASE n.nspname
        WHEN 'public' THEN 0
        WHEN 'platform' THEN 1
        ELSE 2
      END,
      n.nspname
    LIMIT 1
    `,
  );

  const row = result.rows[0];
  if (!row?.schema_name || !row?.table_name) {
    return null;
  }

  return {
    schema: String(row.schema_name),
    table: String(row.table_name),
  };
}

/**
 * True when migration_name = 0001_platform_initial is finished and not rolled back.
 * Does not assume the history table lives in schema platform.
 */
export async function checkPlatformMigrationApplied(
  query: SqlQuery,
  migrationName: string = PLATFORM_MIGRATION_NAME,
): Promise<PlatformMigrationStatus> {
  const located = await locatePrismaMigrationsTable(query);
  if (!located) {
    return { applied: false, schema: null, reason: "table_missing" };
  }

  const qualified = `${quoteIdent(located.schema)}.${quoteIdent(located.table)}`;
  const result = await query(
    `
    SELECT migration_name, finished_at, rolled_back_at
    FROM ${qualified}
    WHERE migration_name = $1
    LIMIT 1
    `,
    [migrationName],
  );

  const row = result.rows[0];
  if (!row) {
    return {
      applied: false,
      schema: located.schema,
      reason: "migration_missing",
    };
  }

  if (row.rolled_back_at != null) {
    return {
      applied: false,
      schema: located.schema,
      reason: "rolled_back",
    };
  }

  if (row.finished_at == null) {
    return {
      applied: false,
      schema: located.schema,
      reason: "not_finished",
    };
  }

  return {
    applied: true,
    schema: located.schema,
    reason: "applied",
  };
}

async function main() {
  const {
    assertSafeEnvironment,
    describeDirectUrlTls,
    redactConnectionString,
    requireSafeEnvironment,
  } = await import("../src/lib/env/guard");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
    resolveProjectRelativePath,
  } = await import("../src/lib/db/ca-certificate");
  const { Pool } = await import("pg");

  const projectRoot = process.cwd();
  const configuredCaPath = process.env.SUPABASE_DB_CA_CERT_PATH ?? "";

  let resolvedCaPath = "";
  try {
    resolvedCaPath = resolveProjectRelativePath(configuredCaPath, projectRoot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to resolve CA path";
    console.error(`[ENV_GUARD] CA_CERT_INVALID: ${message}`);
    process.exit(1);
  }

  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    console.error(
      "DATABASE_URL and DIRECT_URL are required. Copy them from Supabase Connect Panel into .env.local first.",
    );
    process.exit(1);
  }

  const dbMeta = redactConnectionString(databaseUrl);
  const directMeta = redactConnectionString(directUrl);
  const directTls = describeDirectUrlTls(directUrl);

  // Runtime CA from SUPABASE_DB_CA_CERT_PATH only (not from DIRECT_URL query params).
  const { content: caContent, absolutePath: caAbsolutePath } =
    loadSupabaseDbCaCertificate(configuredCaPath, projectRoot);
  const ssl = buildTrustedPgSsl(caContent);

  // Connect with DATABASE_URL only. DIRECT_URL is metadata-only here.
  const poolConfig = buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 });

  console.log("APP_CODE:", process.env.APP_CODE ?? "(missing)");
  console.log("Project root:", path.resolve(projectRoot));
  console.log("Project ref:", guard.projectRef);
  console.log("CA certificate path:", caAbsolutePath);
  console.log(
    "CA path matches resolve(cwd, configured):",
    caAbsolutePath === resolvedCaPath,
  );
  console.log(
    "DATABASE_URL host/port/db:",
    dbMeta.host,
    dbMeta.port,
    dbMeta.database,
  );
  console.log(
    "DIRECT_URL host/port/db (metadata only, not connected):",
    directMeta.host,
    directMeta.port,
    directMeta.database,
  );
  console.log("DIRECT_URL project ref:", directMeta.projectRef);
  console.log("DIRECT_URL TLS mode:", directTls.sslmode ?? "(missing)");
  console.log("SSL verification enabled:", ssl.rejectUnauthorized === true);
  console.log("Pool connection source: DATABASE_URL");
  console.log("Write operations: NONE");

  const pool = new Pool(poolConfig);

  try {
    const ping = await pool.query(
      "select current_database() as db, current_user as usr",
    );
    console.log("Connection success: true");
    console.log("Read-only ping OK. database:", ping.rows[0]?.db);

    const schema = await pool.query(
      `select schema_name from information_schema.schemata where schema_name = 'platform'`,
    );
    const tables = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'platform'`,
    );

    const migrationStatus = await checkPlatformMigrationApplied(async (text, values) =>
      pool.query(text, values),
    );
    console.log("Platform migration applied:", migrationStatus.applied);
    if (migrationStatus.schema) {
      console.log("Prisma migrations table schema:", migrationStatus.schema);
    }
    if (!migrationStatus.applied) {
      console.log("Platform migration status reason:", migrationStatus.reason);
    }

    if (schema.rowCount && tables.rowCount && tables.rowCount > 0) {
      console.log(
        `Note: schema platform already has ${tables.rowCount} table(s). Review before applying migrations.`,
      );
    } else {
      console.log(
        "Platform schema tables: none yet (ready for initial migration after approval)",
      );
    }
  } catch (error) {
    console.log("Connection success: false");
    throw error;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/db-preflight.ts");

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "preflight failed";
    console.error(
      "db:preflight failed:",
      message
        .replace(/:[^:@/]+@/g, ":***@")
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]"),
    );
    process.exit(1);
  });
}
