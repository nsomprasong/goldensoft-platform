/**
 * Billing catalog seed (masters + permissions).
 *
 * SEED_MODE=system (or unset) only. Idempotent upserts.
 * Production + development-demo is refused.
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { resolveSeedMode } = await import("../src/lib/seed/seed-mode");
  const {
    PLATFORM_PERMISSIONS,
    PLATFORM_PERMISSION_LABELS,
    PLATFORM_PERMISSION_DESCRIPTIONS,
  } = await import("../src/lib/permissions/codes");
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

  if (
    process.env.SEED_MODE?.trim().toLowerCase() === "development-demo" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error("ปฏิเสธการ seed: production + development-demo ไม่อนุญาต");
    process.exit(1);
  }

  const mode = resolveSeedMode();
  if (mode !== "system") {
    console.error(
      `Billing catalog รองรับ SEED_MODE=system เท่านั้น (ได้รับ "${mode}")`,
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const masters: Array<{
    model:
      | "billingAccountStatus"
      | "creditDirection"
      | "creditTransactionType"
      | "invoiceStatus"
      | "paymentStatus"
      | "paymentMethod";
    rows: Array<{ code: string; nameTh: string; nameEn: string; sortOrder: number }>;
  }> = [
    {
      model: "billingAccountStatus",
      rows: [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "SUSPENDED", nameTh: "ระงับ", nameEn: "Suspended", sortOrder: 2 },
        { code: "CLOSED", nameTh: "ปิดบัญชี", nameEn: "Closed", sortOrder: 3 },
      ],
    },
    {
      model: "creditDirection",
      rows: [
        { code: "CREDIT", nameTh: "เข้า", nameEn: "Credit", sortOrder: 1 },
        { code: "DEBIT", nameTh: "ออก", nameEn: "Debit", sortOrder: 2 },
      ],
    },
    {
      model: "creditTransactionType",
      rows: [
        { code: "TOP_UP", nameTh: "เติมเครดิต", nameEn: "Top up", sortOrder: 1 },
        { code: "DEBIT", nameTh: "หักเครดิต", nameEn: "Debit", sortOrder: 2 },
        {
          code: "ADJUSTMENT_CREDIT",
          nameTh: "ปรับปรุงเพิ่ม",
          nameEn: "Adjustment credit",
          sortOrder: 3,
        },
        {
          code: "ADJUSTMENT_DEBIT",
          nameTh: "ปรับปรุงลด",
          nameEn: "Adjustment debit",
          sortOrder: 4,
        },
        { code: "REFUND", nameTh: "คืนเงิน", nameEn: "Refund", sortOrder: 5 },
        { code: "EXPIRY", nameTh: "หมดอายุ", nameEn: "Expiry", sortOrder: 6 },
        {
          code: "INVOICE_PAYMENT",
          nameTh: "ชำระใบแจ้งหนี้",
          nameEn: "Invoice payment",
          sortOrder: 7,
        },
        {
          code: "SUBSCRIPTION_CHARGE",
          nameTh: "คิดค่าบริการ",
          nameEn: "Subscription charge",
          sortOrder: 8,
        },
        { code: "REVERSAL", nameTh: "กลับรายการ", nameEn: "Reversal", sortOrder: 9 },
      ],
    },
    {
      model: "invoiceStatus",
      rows: [
        { code: "DRAFT", nameTh: "ร่าง", nameEn: "Draft", sortOrder: 1 },
        { code: "ISSUED", nameTh: "ออกแล้ว", nameEn: "Issued", sortOrder: 2 },
        {
          code: "PARTIALLY_PAID",
          nameTh: "ชำระบางส่วน",
          nameEn: "Partially paid",
          sortOrder: 3,
        },
        { code: "PAID", nameTh: "ชำระครบ", nameEn: "Paid", sortOrder: 4 },
        { code: "OVERDUE", nameTh: "เกินกำหนด", nameEn: "Overdue", sortOrder: 5 },
        { code: "VOID", nameTh: "โมฆะ", nameEn: "Void", sortOrder: 6 },
        {
          code: "CANCELLED",
          nameTh: "ยกเลิก",
          nameEn: "Cancelled",
          sortOrder: 7,
        },
      ],
    },
    {
      model: "paymentStatus",
      rows: [
        { code: "PENDING", nameTh: "รอยืนยัน", nameEn: "Pending", sortOrder: 1 },
        {
          code: "CONFIRMED",
          nameTh: "ยืนยันแล้ว",
          nameEn: "Confirmed",
          sortOrder: 2,
        },
        { code: "FAILED", nameTh: "ไม่สำเร็จ", nameEn: "Failed", sortOrder: 3 },
        {
          code: "CANCELLED",
          nameTh: "ยกเลิก",
          nameEn: "Cancelled",
          sortOrder: 4,
        },
        {
          code: "REFUNDED",
          nameTh: "คืนเงินแล้ว",
          nameEn: "Refunded",
          sortOrder: 5,
        },
      ],
    },
    {
      model: "paymentMethod",
      rows: [
        {
          code: "BANK_TRANSFER",
          nameTh: "โอนเงิน",
          nameEn: "Bank transfer",
          sortOrder: 1,
        },
        { code: "CASH", nameTh: "เงินสด", nameEn: "Cash", sortOrder: 2 },
        {
          code: "MANUAL_CREDIT",
          nameTh: "เครดิต (บันทึกมือ)",
          nameEn: "Manual credit",
          sortOrder: 3,
        },
        {
          code: "PROMPTPAY",
          nameTh: "พร้อมเพย์ (ยังไม่เปิดใช้)",
          nameEn: "PromptPay (unused)",
          sortOrder: 4,
        },
        {
          code: "CARD",
          nameTh: "บัตรเครดิต (ยังไม่เปิดใช้)",
          nameEn: "Card (unused)",
          sortOrder: 5,
        },
        { code: "OTHER", nameTh: "อื่น ๆ", nameEn: "Other", sortOrder: 6 },
      ],
    },
  ];

  try {
    console.log(`Seeding mode=${mode} billing catalog`);
    for (const group of masters) {
      for (const row of group.rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = (prisma as any)[group.model];
        await client.upsert({
          where: { code: row.code },
          update: {
            nameTh: row.nameTh,
            nameEn: row.nameEn,
            sortOrder: row.sortOrder,
            isSystem: true,
            isActive: true,
          },
          create: {
            code: row.code,
            nameTh: row.nameTh,
            nameEn: row.nameEn,
            sortOrder: row.sortOrder,
            isSystem: true,
            isActive: true,
          },
        });
      }
    }

    const billingPermissionCodes = Object.values(PLATFORM_PERMISSIONS).filter(
      (code) => code.startsWith("billing."),
    );
    let permCount = 0;
    for (const [index, code] of billingPermissionCodes.entries()) {
      const resource = code.split(".")[1] ?? "billing";
      const action = code.split(".")[2] ?? "read";
      await prisma.permission.upsert({
        where: { code },
        update: {
          nameTh: PLATFORM_PERMISSION_LABELS[code],
          nameEn: code,
          descriptionTh: PLATFORM_PERMISSION_DESCRIPTIONS[code],
          productCode: "PLATFORM",
          resource,
          action,
          sortOrder: 300 + index,
          isSystem: true,
          isActive: true,
        },
        create: {
          code,
          nameTh: PLATFORM_PERMISSION_LABELS[code],
          nameEn: code,
          descriptionTh: PLATFORM_PERMISSION_DESCRIPTIONS[code],
          productCode: "PLATFORM",
          resource,
          action,
          sortOrder: 300 + index,
          isSystem: true,
          isActive: true,
        },
      });
      permCount += 1;
    }

    console.log(
      JSON.stringify({
        ok: true,
        masters: masters.reduce((n, g) => n + g.rows.length, 0),
        billingPermissions: permCount,
      }),
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
