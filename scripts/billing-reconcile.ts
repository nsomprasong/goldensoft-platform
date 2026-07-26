/**
 * Read-only billing reconciliation.
 * Exits non-zero on mismatch. Does not mutate data.
 */
export {};

type Finding = {
  code: string;
  severity: "error" | "warn";
  organizationId?: string;
  entityId?: string;
  detail: string;
};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { foldLedgerBalance, money } = await import("../src/lib/billing/money");
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

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 2 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const findings: Finding[] = [];

  try {
    const accounts = await prisma.billingAccount.findMany({
      select: {
        id: true,
        organizationId: true,
        currency: true,
        currentBalanceSnapshot: true,
      },
    });

    for (const account of accounts) {
      const rows = await prisma.creditTransaction.findMany({
        where: { billingAccountId: account.id },
        include: { direction: true },
        orderBy: { createdAt: "asc" },
      });
      const ledger = foldLedgerBalance(
        rows.map((row) => ({
          amount: row.amount,
          direction: row.direction.code as "CREDIT" | "DEBIT",
        })),
      );
      const snapshot = account.currentBalanceSnapshot ?? money(0);
      if (!ledger.eq(snapshot)) {
        findings.push({
          code: "LEDGER_SNAPSHOT_MISMATCH",
          severity: "error",
          organizationId: account.organizationId,
          entityId: account.id,
          detail: `ledger=${ledger.toFixed(2)} snapshot=${snapshot.toFixed(2)}`,
        });
      }

      for (const row of rows) {
        if (row.currency !== account.currency) {
          findings.push({
            code: "CURRENCY_MISMATCH",
            severity: "error",
            organizationId: account.organizationId,
            entityId: row.id,
            detail: `tx currency ${row.currency} != account ${account.currency}`,
          });
        }
      }
    }

    const invoices = await prisma.invoice.findMany({
      include: { allocations: true, status: true },
    });
    for (const invoice of invoices) {
      const paid = invoice.allocations.reduce(
        (sum, row) => sum.plus(row.amount),
        money(0),
      );
      if (!paid.eq(invoice.paidTotal)) {
        findings.push({
          code: "INVOICE_PAID_TOTAL_MISMATCH",
          severity: "error",
          organizationId: invoice.organizationId,
          entityId: invoice.id,
          detail: `allocations=${paid.toFixed(2)} paidTotal=${invoice.paidTotal.toFixed(2)}`,
        });
      }
      const outstanding = invoice.grandTotal.minus(paid);
      const expected = outstanding.lt(0) ? money(0) : outstanding;
      if (
        !["VOID", "CANCELLED", "DRAFT"].includes(invoice.status.code) &&
        !expected.eq(invoice.outstandingTotal)
      ) {
        findings.push({
          code: "INVOICE_OUTSTANDING_MISMATCH",
          severity: "error",
          organizationId: invoice.organizationId,
          entityId: invoice.id,
          detail: `expected=${expected.toFixed(2)} outstanding=${invoice.outstandingTotal.toFixed(2)}`,
        });
      }
    }

    const payments = await prisma.payment.findMany({
      include: { allocations: true },
    });
    for (const payment of payments) {
      const allocated = payment.allocations.reduce(
        (sum, row) => sum.plus(row.amount),
        money(0),
      );
      if (allocated.gt(payment.amount)) {
        findings.push({
          code: "PAYMENT_OVER_ALLOCATED",
          severity: "error",
          organizationId: payment.organizationId,
          entityId: payment.id,
          detail: `allocated=${allocated.toFixed(2)} payment=${payment.amount.toFixed(2)}`,
        });
      }
    }

    const orphanAllocations = await prisma.$queryRaw<
      Array<{ id: string }>
    >`
      SELECT pa.id
      FROM platform.payment_allocations pa
      LEFT JOIN platform.payments p ON p.id = pa.payment_id
      LEFT JOIN platform.invoices i ON i.id = pa.invoice_id
      WHERE p.id IS NULL OR i.id IS NULL
    `;
    for (const row of orphanAllocations) {
      findings.push({
        code: "ORPHAN_ALLOCATION",
        severity: "error",
        entityId: row.id,
        detail: "allocation missing payment or invoice",
      });
    }

    const multiPrimary = await prisma.$queryRaw<
      Array<{ organization_id: string; count: bigint }>
    >`
      SELECT organization_id, COUNT(*)::bigint AS count
      FROM platform.billing_contacts
      WHERE is_primary = true AND is_active = true
      GROUP BY organization_id
      HAVING COUNT(*) > 1
    `;
    for (const row of multiPrimary) {
      findings.push({
        code: "MULTIPLE_PRIMARY_CONTACTS",
        severity: "error",
        organizationId: row.organization_id,
        detail: `active primary contacts=${String(row.count)}`,
      });
    }

    const errors = findings.filter((f) => f.severity === "error");
    const report = {
      ok: errors.length === 0,
      checkedAt: new Date().toISOString(),
      accounts: accounts.length,
      invoices: invoices.length,
      payments: payments.length,
      findings: findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        organizationId: f.organizationId ? "[redacted-id]" : undefined,
        entityId: f.entityId ? "[redacted-id]" : undefined,
        detail: f.detail.replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
          "[uuid]",
        ),
      })),
      errorCount: errors.length,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(errors.length === 0 ? 0 : 2);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "reconcile failed",
    );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(error.code);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
