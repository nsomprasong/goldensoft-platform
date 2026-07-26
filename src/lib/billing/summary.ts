import type { PrismaClient } from "@prisma/client";

import { getBillingAccount, serializeBillingAccount } from "@/lib/billing/accounts";
import { getCreditBalance } from "@/lib/billing/credit";
import { serializeMoney } from "@/lib/billing/money";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";

export async function getOrganizationProductSummary(db: PrismaClient, organizationId: string) {
  const subscriptions = await db.subscription.findMany({
    where: { organizationId }, include: { product: true, status: true, billingCycle: true },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return subscriptions.map((row) => ({
    id: row.id, productCode: row.product.code, productName: row.product.nameTh ?? row.product.name,
    planCode: row.planCode, planVersionNumber: row.planVersionNumber, status: row.status.code,
    billingCycle: row.billingCycle.code, priceAmount: serializeMoney(row.priceAmount), currency: row.currency,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null,
    daysRemaining: row.endsAt ? Math.max(0, Math.ceil((row.endsAt.getTime() - now) / 86_400_000)) : null,
  }));
}

export async function getBillingSummary(db: PrismaClient, organizationId: string, permissions: readonly string[]) {
  const can = (code: string) => permissions.includes(code);
  const [account, credit, products, invoiceCounts] = await Promise.all([
    can(PLATFORM_PERMISSIONS.billingAccountRead) ? getBillingAccount(db, organizationId) : null,
    can(PLATFORM_PERMISSIONS.billingCreditRead) ? getCreditBalance(db, organizationId) : null,
    can(PLATFORM_PERMISSIONS.billingSubscriptionRead) ? getOrganizationProductSummary(db, organizationId) : [],
    can(PLATFORM_PERMISSIONS.billingInvoiceRead) ? db.invoice.groupBy({ by: ["statusId"], where: { organizationId }, _count: true }) : [],
  ]);
  return {
    hasBillingAccount: Boolean(account),
    account: account ? serializeBillingAccount(account) : null,
    credit: credit ? { balance: serializeMoney(credit.balance), creditLimit: serializeMoney(credit.creditLimit), availableCredit: serializeMoney(credit.availableCredit), currency: credit.currency } : null,
    products,
    invoiceStatusCounts: invoiceCounts,
  };
}
