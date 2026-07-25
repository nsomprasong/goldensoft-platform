/**
 * Bootstrap GoldenSoft organization (Preview + Confirm).
 *
 * Environment must load before any module that reads process.env.
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
    bootstrapGoldensoftOrganization,
    formatOrgPreviewThai,
    ORG_BOOTSTRAP_CONFIRM_VALUE,
    OrgBootstrapError,
  } = await import("../src/lib/platform/bootstrap-organization");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL ใน .env.local");
    process.exit(1);
  }

  const confirmed =
    (process.env.ORGANIZATION_BOOTSTRAP_CONFIRM ?? "").trim() ===
    ORG_BOOTSTRAP_CONFIRM_VALUE;

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH,
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await bootstrapGoldensoftOrganization({
      db: prisma,
      projectRef: guard.projectRef ?? "unknown",
      dryRun: !confirmed,
    });

    for (const line of formatOrgPreviewThai(result.preview)) {
      console.log(line);
    }

    if (!confirmed) {
      console.log(
        `ต้องการยืนยัน: ORGANIZATION_BOOTSTRAP_CONFIRM=${ORG_BOOTSTRAP_CONFIRM_VALUE}`,
      );
      process.exit(1);
    }

    console.log("สร้างองค์กร GoldenSoft สำเร็จ");
    console.log("จำนวนที่สร้างใหม่:", {
      องค์กร: result.counts.organizationsCreated,
      สาขา: result.counts.branchesCreated,
      audit: result.counts.auditsCreated,
      ใช้ซ้ำ: result.counts.reused,
    });
    console.log("องค์กร:", result.maskedOrganizationId);
    console.log("สาขา:", result.maskedBranchId);
  } catch (error) {
    const message =
      error instanceof OrgBootstrapError
        ? error.message
        : error instanceof Error
          ? error.message
          : "ดำเนินการไม่สำเร็จ";
    console.error(message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
