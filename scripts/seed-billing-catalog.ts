import { prisma } from "../src/lib/prisma";

const masters = [
  ["billingAccountStatus", ["ACTIVE", "SUSPENDED", "CLOSED"]],
  ["creditDirection", ["CREDIT", "DEBIT"]],
  ["creditTransactionType", ["TOP_UP", "DEBIT", "ADJUSTMENT_CREDIT", "ADJUSTMENT_DEBIT", "REFUND", "EXPIRY", "INVOICE_PAYMENT", "SUBSCRIPTION_CHARGE", "REVERSAL"]],
  ["invoiceStatus", ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "CANCELLED"]],
  ["paymentStatus", ["PENDING", "CONFIRMED", "FAILED", "CANCELLED", "REFUNDED"]],
  ["paymentMethod", ["BANK_TRANSFER", "CASH", "MANUAL_CREDIT", "PROMPTPAY", "CARD", "OTHER"]],
] as const;
async function main() {
  for (const [model, codes] of masters) for (const [sortOrder, code] of codes.entries()) {
    const client = prisma[model] as { upsert(args: unknown): Promise<unknown> };
    await client.upsert({ where: { code }, update: {}, create: { code, nameTh: code, nameEn: code, sortOrder, isSystem: true } });
  }
}
main().finally(() => prisma.$disconnect());
