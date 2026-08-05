export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());
  process.env.APP_CODE = "PLATFORM";

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { requireSafeEnvironment } = await import("../src/lib/env/guard");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");

  requireSafeEnvironment({ projectRoot: process.cwd() });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    process.cwd(),
  );
  const pool = new Pool(
    buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }),
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of [
        { code: "PRIMARY", nameTh: "ผู้รับผิดชอบหลัก", nameEn: "Primary owner", sortOrder: 10 },
        { code: "CO_OWNER", nameTh: "ผู้รับผิดชอบร่วม", nameEn: "Co-owner", sortOrder: 20 },
        { code: "SUPPORT", nameTh: "ทีม Support", nameEn: "Support", sortOrder: 30 },
      ]) {
        await tx.customerAssignmentRole.upsert({ where: { code: row.code }, create: { ...row, isActive: true, isSystem: true }, update: {} });
      }
      for (const row of [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 10 },
        { code: "INACTIVE", nameTh: "ไม่ใช้งาน", nameEn: "Inactive", sortOrder: 20 },
        { code: "REVOKED", nameTh: "ถอนการมอบหมาย", nameEn: "Revoked", sortOrder: 30 },
      ]) {
        await tx.customerAssignmentStatus.upsert({ where: { code: row.code }, create: { ...row, isActive: true, isSystem: true }, update: {} });
      }
      for (const row of [
        { code: "ALL_CURRENT_AND_FUTURE", nameTh: "ทุกสาขาปัจจุบันและอนาคต", nameEn: "All current and future branches", sortOrder: 10 },
        { code: "SELECTED_BRANCHES", nameTh: "เฉพาะสาขาที่เลือก", nameEn: "Selected branches", sortOrder: 20 },
      ]) {
        await tx.customerAssignmentScopeType.upsert({ where: { code: row.code }, create: { ...row, isActive: true, isSystem: true }, update: {} });
      }
      for (const row of [
        { code: "customer_assignment.manage", nameTh: "จัดการผู้รับผิดชอบองค์กรลูกค้า", nameEn: "Manage customer assignments", action: "manage", sortOrder: 810 },
        { code: "customer_assignment.transfer", nameTh: "โอนผู้รับผิดชอบหลัก", nameEn: "Transfer customer assignment", action: "transfer", sortOrder: 820 },
      ]) {
        await tx.permission.upsert({
          where: { code: row.code },
          create: {
            ...row,
            descriptionTh: row.nameTh,
            productCode: "PLATFORM",
            scopeCode: "PLATFORM",
            resource: "customer_assignment",
            featureCode: "CUSTOMER_ASSIGNMENT",
            menuCode: "CUSTOMER_ASSIGNMENT",
            menuNameTh: "ผู้รับผิดชอบองค์กรลูกค้า",
            menuCategoryTh: "การจัดการลูกค้า",
            isNavigation: false,
            isActive: true,
            isSystem: true,
          },
          update: {},
        });
      }
    });

    const [roles, statuses, scopes, permissions] = await Promise.all([
      prisma.customerAssignmentRole.count({ where: { code: { in: ["PRIMARY", "CO_OWNER", "SUPPORT"] } } }),
      prisma.customerAssignmentStatus.count({ where: { code: { in: ["ACTIVE", "INACTIVE", "REVOKED"] } } }),
      prisma.customerAssignmentScopeType.count({ where: { code: { in: ["ALL_CURRENT_AND_FUTURE", "SELECTED_BRANCHES"] } } }),
      prisma.permission.count({ where: { code: { in: ["customer_assignment.manage", "customer_assignment.transfer"] } } }),
    ]);
    console.log(JSON.stringify({ roles, statuses, scopes, permissions }));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
