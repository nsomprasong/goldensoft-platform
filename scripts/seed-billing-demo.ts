/**
 * Development billing demo seed.
 * Requires SEED_MODE=development-demo and NODE_ENV !== production.
 * Only DEMO_ORG_CODES — never GOLDENSOFT.
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { resolveSeedMode } = await import("../src/lib/seed/seed-mode");
  const { DEMO_ORG_CODES } = await import("../src/lib/seed/demo-dataset");
  const { ensureBillingAccount } = await import("../src/lib/billing/accounts");
  const { adjustCredit } = await import("../src/lib/billing/credit");
  const {
    createDraftInvoice,
    issueInvoice,
  } = await import("../src/lib/billing/invoices");
  const {
    recordManualPayment,
    confirmPayment,
    allocatePayment,
  } = await import("../src/lib/billing/payments");
  const {
    createBillingContact,
    setPrimaryBillingContact,
  } = await import("../src/lib/billing/contacts");
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

  if (process.env.NODE_ENV === "production") {
    console.error("seed:billing-demo forbidden in production");
    process.exit(1);
  }

  process.env.SEED_MODE = process.env.SEED_MODE ?? "development-demo";
  const mode = resolveSeedMode();
  if (mode !== "development-demo") {
    console.error(
      `seed:billing-demo requires SEED_MODE=development-demo (got ${mode})`,
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
  const actor = "00000000-0000-4000-8000-0000000000bd";

  try {
    const orgs = await prisma.organization.findMany({
      where: {
        deletedAt: null,
        customerCode: { in: [...DEMO_ORG_CODES] },
      },
      orderBy: { customerCode: "asc" },
    });
    const safeOrgs = orgs.filter(
      (o) => !o.customerCode.toUpperCase().includes("GOLDENSOFT"),
    );
    if (safeOrgs.length === 0) {
      console.error(
        "ไม่พบ demo organizations (RESORT-DEMO / COMPANY-DEMO / STATION-DEMO) — รัน seed:demo ก่อน",
      );
      process.exit(1);
    }

    const summary: Array<Record<string, unknown>> = [];
    for (const org of safeOrgs) {
      await ensureBillingAccount(prisma, {
        organizationId: org.id,
        actorAuthUserId: actor,
      });

      await adjustCredit(prisma, {
        organizationId: org.id,
        direction: "CREDIT",
        amount: "1000.00",
        reason: "เติมเครดิตตัวอย่าง (demo)",
        actorAuthUserId: actor,
        idempotencyKey: `demo:topup:${org.customerCode}`,
        transactionTypeCode: "TOP_UP",
      });

      await adjustCredit(prisma, {
        organizationId: org.id,
        direction: "DEBIT",
        amount: "150.00",
        reason: "หักเครดิตตัวอย่าง (demo)",
        actorAuthUserId: actor,
        idempotencyKey: `demo:debit:${org.customerCode}`,
      });

      const draftNumber = `DEMO-INV-${org.customerCode}-001`;
      let invoice = await prisma.invoice.findUnique({
        where: { invoiceNumber: draftNumber },
        include: { status: true },
      });
      if (!invoice) {
        invoice = await createDraftInvoice(prisma, {
          organizationId: org.id,
          actorAuthUserId: actor,
          invoiceNumber: draftNumber,
          dueDate: new Date(Date.now() + 7 * 86400000),
          notes: "ใบแจ้งหนี้ตัวอย่าง",
          items: [
            {
              itemType: "SUBSCRIPTION",
              description: "แพ็กเกจตัวอย่าง",
              quantity: 1,
              unitPrice: "500.00",
              discountAmount: "0",
              taxAmount: "0",
            },
          ],
        });
      }
      if (invoice.status.code === "DRAFT") {
        invoice = await issueInvoice(prisma, invoice.id, actor);
      }

      const paymentNumber = `DEMO-PAY-${org.customerCode}-001`;
      let payment = await prisma.payment.findUnique({
        where: { paymentNumber },
      });
      if (!payment) {
        payment = await recordManualPayment(prisma, {
          organizationId: org.id,
          actorAuthUserId: actor,
          paymentNumber,
          amount: "500.00",
          methodCode: "BANK_TRANSFER",
          referenceNumber: `REF-${org.customerCode}`,
          notes: "ชำระตัวอย่างแบบมือ",
        });
        await confirmPayment(prisma, payment.id, actor);
        await allocatePayment(prisma, {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount: "500.00",
          actorAuthUserId: actor,
        });
      }

      const existingContact = await prisma.billingContact.findFirst({
        where: { organizationId: org.id, email: `billing+${org.customerCode.toLowerCase()}@example.invalid` },
      });
      if (!existingContact) {
        const contact = await createBillingContact(prisma, org.id, actor, {
          name: "ผู้ติดต่อตัวอย่าง",
          email: `billing+${org.customerCode.toLowerCase()}@example.invalid`,
          phone: "0800000000",
          title: "การเงิน",
          isPrimary: true,
        });
        await setPrimaryBillingContact(prisma, org.id, contact.id, actor);
      }

      summary.push({
        customerCode: org.customerCode,
        organizationId: org.id,
        invoiceNumber: draftNumber,
        paymentNumber,
      });
    }

    console.log(JSON.stringify({ ok: true, mode, seeded: summary }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
