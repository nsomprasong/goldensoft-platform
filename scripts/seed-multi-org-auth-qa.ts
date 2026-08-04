/**
 * Platform multi-org Auth QA addon.
 *
 *   npm run seed:multi-org-auth-qa
 *
 * Prerequisite: npm run seed:full-qa
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

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
    seedMultiOrgAuthQaDataset,
    MULTI_ORG_QA_PASSWORD,
  } = await import("../src/lib/seed/multi-org-auth-qa-dataset");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  if (process.env.NODE_ENV === "production") {
    console.error("seed:multi-org-auth-qa forbidden in production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL ใน .env.local");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log("Seeding multi-org Auth QA users (dual-company + branch + rehire)…");
    const result = await seedMultiOrgAuthQaDataset(prisma);
    console.log(
      JSON.stringify(
        {
          password: MULTI_ORG_QA_PASSWORD,
          users: result.users.map((u) => ({
            key: u.key,
            email: u.email,
            displayName: u.displayName,
            memberships: u.memberships,
            scenario: u.scenario,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      "\nNext: cd ../goldensoft-hr && npm run seed:multi-org-auth-qa",
    );
    console.log(`Password: ${MULTI_ORG_QA_PASSWORD}`);
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
