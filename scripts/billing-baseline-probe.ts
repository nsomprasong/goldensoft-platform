import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());

async function main() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    process.cwd(),
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tables = (await prisma.$queryRawUnsafe(
      `SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname='platform' ORDER BY 1`,
    )) as Array<{ tablename: string }>;
    const billing = tables.filter((t) =>
      /billing|credit_transaction|invoice|payment_/.test(t.tablename),
    );
    const migs = (await prisma.$queryRawUnsafe(
      `SELECT migration_name::text AS migration_name,
              (finished_at IS NOT NULL) AS ok,
              (rolled_back_at IS NOT NULL) AS rolled
       FROM _prisma_migrations
       ORDER BY started_at`,
    )) as Array<{ migration_name: string; ok: boolean; rolled: boolean }>;
    const orgs = await prisma.organization.count({ where: { deletedAt: null } });
    const subs = await prisma.subscription.count();
    console.log(
      JSON.stringify(
        {
          tableCount: tables.length,
          billingTableCount: billing.length,
          billingTables: billing.map((t) => t.tablename),
          migrations: migs,
          orgs,
          subs,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
