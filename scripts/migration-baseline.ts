/**
 * Read-only baseline before migration 0005.
 */
import { loadProjectEnv } from "./load-project-env";

async function main() {
  loadProjectEnv(process.cwd());
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");

  const root = process.cwd();
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    root,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(
    buildDatabasePoolConfig(process.env.DATABASE_URL!, ssl, { max: 1 }),
  );
  try {
    const tables = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM information_schema.tables
       WHERE table_schema = 'platform' AND table_type = 'BASE TABLE'`,
    );
    const subs = await pool.query(
      `SELECT COUNT(*)::int AS c FROM platform.subscriptions`,
    );
    const migs = await pool.query(
      `SELECT migration_name,
              finished_at IS NOT NULL AS finished,
              rolled_back_at IS NOT NULL AS rolled
       FROM _prisma_migrations
       WHERE migration_name LIKE '000%'
       ORDER BY started_at`,
    );
    console.log(
      JSON.stringify(
        {
          platformTables: tables.rows[0]?.c,
          subscriptions: subs.rows[0]?.c,
          migrations: migs.rows,
          projectRefHint: "from env guard / preflight only",
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
