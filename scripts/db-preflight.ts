import { loadEnvConfig } from "@next/env";
import path from "node:path";

// Load .env.local / .env before any Environment Guard usage.
loadEnvConfig(process.cwd());

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
    const migrations = await pool.query(
      `select 1 from information_schema.tables
       where table_schema = 'platform' and table_name = '_prisma_migrations'
       limit 1`,
    );

    const migrationApplied = Boolean(migrations.rowCount);
    console.log("Platform migration applied:", migrationApplied);

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
