/**
 * Cleanup Platform multi-org Auth QA addon.
 *
 *   npm run seed:multi-org-auth-qa:cleanup
 *   npm run seed:multi-org-auth-qa:cleanup -- --dry-run
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const dryRun = process.argv.includes("--dry-run");

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");

  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );
  const {
    cleanupMultiOrgAuthQaDataset,
    MULTI_ORG_QA_ROSTER,
  } = await import("../src/lib/seed/multi-org-auth-qa-dataset");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  if (process.env.NODE_ENV === "production") {
    console.error("multi-org-auth-qa cleanup forbidden in production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL ใน .env.local");
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          emails: MULTI_ORG_QA_ROSTER.map((p) => p.email),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await cleanupMultiOrgAuthQaDataset(prisma);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    message
      .replace(/:[^:@/]+@/g, ":***@")
      .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]"),
  );
  process.exit(1);
});
