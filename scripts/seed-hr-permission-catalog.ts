/**
 * HR permission catalog seed (GOLDENSOFT_HR).
 *
 * Publishes `platform.permissions` rows for the HR product by upserting on
 * `code`. Catalog data is *not* shipped as a migration: the additive migration
 * check requires real schema DDL, so an INSERT-only migration would be
 * rejected. This script performs no DDL and applies no migration.
 *
 * SEED_MODE=system (or unset) only. development-demo / production-bootstrap are
 * rejected, and a demo seed in production is refused outright.
 *
 * Idempotent: re-running only refreshes labels / resource / action metadata.
 *
 * Environment must load before any module that reads process.env / PrismaClient.
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");

  const { resolveSeedMode } = await import("../src/lib/seed/seed-mode");
  const { HR_PERMISSION_CATALOG, HR_PRODUCT_CODE } = await import(
    "../src/lib/permissions/hr-codes"
  );
  const { ORGANIZATION_STANDARD_ROLE_CATALOG } = await import(
    "../src/lib/permissions/organization-role-catalog"
  );
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const rawMode = process.env.SEED_MODE?.trim().toLowerCase();
  if (rawMode === "development-demo" && process.env.NODE_ENV === "production") {
    console.error(
      "ปฏิเสธการ seed: production + development-demo (production-demo) ไม่อนุญาต",
    );
    process.exit(1);
  }

  const mode = resolveSeedMode();
  if (mode !== "system") {
    console.error(
      `HR permission catalog รองรับ SEED_MODE=system เท่านั้น (ได้รับ "${mode}")`,
    );
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
    console.log(`Seeding mode=${mode} product=${HR_PRODUCT_CODE}`);

    const codes = HR_PERMISSION_CATALOG.map((entry) => entry.code);
    const before = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const existing = new Set(before.map((row) => row.code));

    for (const entry of HR_PERMISSION_CATALOG) {
      const data = {
        nameTh: entry.nameTh,
        nameEn: entry.nameEn,
        productCode: entry.productCode,
        resource: entry.resource,
        action: entry.action,
        sortOrder: entry.sortOrder,
        isActive: true,
        isSystem: true,
      };
      await prisma.permission.upsert({
        where: { code: entry.code },
        create: { code: entry.code, ...data },
        update: data,
      });
    }

    const created = codes.filter((code) => !existing.has(code)).length;
    console.log(
      `HR permissions upserted: ${codes.length} (created ${created}, updated ${codes.length - created})`,
    );

    let roleCount = 0;
    let grantCount = 0;
    for (const template of ORGANIZATION_STANDARD_ROLE_CATALOG) {
      const existingRole = await prisma.organizationRole.findFirst({
        where: { organizationId: null, code: template.code },
        select: { id: true },
      });
      const role = existingRole
        ? await prisma.organizationRole.update({
            where: { id: existingRole.id },
            data: {
              nameTh: template.nameTh,
              nameEn: template.nameEn,
              description: template.description,
              sortOrder: template.sortOrder,
              isActive: true,
              isSystem: true,
            },
          })
        : await prisma.organizationRole.create({
            data: {
              organizationId: null,
              code: template.code,
              nameTh: template.nameTh,
              nameEn: template.nameEn,
              description: template.description,
              sortOrder: template.sortOrder,
              isActive: true,
              isSystem: true,
            },
          });
      roleCount += 1;

      if (!("permissionCodes" in template)) continue;
      const permissionCodes = [...template.permissionCodes];
      const permissions = await prisma.permission.findMany({
        where: { code: { in: permissionCodes }, isActive: true },
        select: { id: true, code: true },
      });
      if (permissions.length !== new Set(permissionCodes).size) {
        throw new Error(`Permission catalog incomplete for role ${template.code}`);
      }
      for (const permission of permissions) {
        await prisma.organizationRolePermission.upsert({
          where: {
            organizationRoleId_permissionId: {
              organizationRoleId: role.id,
              permissionId: permission.id,
            },
          },
          create: {
            organizationRoleId: role.id,
            permissionId: permission.id,
          },
          update: { revokedAt: null },
        });
        grantCount += 1;
      }
      await prisma.organizationRolePermission.updateMany({
        where: {
          organizationRoleId: role.id,
          revokedAt: null,
          permission: {
            productCode: HR_PRODUCT_CODE,
            code: { notIn: permissionCodes },
          },
        },
        data: { revokedAt: new Date() },
      });
    }
    console.log(`Organization role templates upserted: ${roleCount}; permission grants: ${grantCount}`);

    const product = await prisma.product.findUnique({
      where: { code: HR_PRODUCT_CODE },
      select: { code: true },
    });
    if (!product) {
      console.warn(
        `หมายเหตุ: ยังไม่มี product ${HR_PRODUCT_CODE} ในระบบ — catalog พร้อมใช้เมื่อสร้าง product แล้ว`,
      );
    }
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
