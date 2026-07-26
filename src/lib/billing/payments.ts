import { type PrismaClient } from "@prisma/client";

import { getBillingAccount } from "@/lib/billing/accounts";
import { BillingError, UNUSED_GATEWAY_METHODS } from "@/lib/billing/codes";
import { parsePositiveAmount } from "@/lib/billing/money";
import { reconcileInvoiceStatus } from "@/lib/billing/invoices";
import { writeAuditLog } from "@/lib/platform/audit";

async function idByCode(db: PrismaClient, model: "paymentStatus" | "paymentMethod", code: string) {
  const row = model === "paymentStatus"
    ? await db.paymentStatus.findUnique({ where: { code } })
    : await db.paymentMethod.findUnique({ where: { code } });
  if (!row) throw new BillingError("MASTER_MISSING", "ไม่พบข้อมูลอ้างอิงการชำระเงิน", 500);
  return row.id;
}

export async function recordManualPayment(db: PrismaClient, input: {
  organizationId: string; actorAuthUserId: string; paymentNumber: string; amount: unknown;
  methodCode: string; paidAt?: Date; referenceNumber?: string | null; evidenceUrl?: string | null; notes?: string | null;
}) {
  if (UNUSED_GATEWAY_METHODS.has(input.methodCode as never)) throw new BillingError("UNUSED_GATEWAY_METHOD", "ช่องทางนี้ยังไม่เปิดใช้งานการชำระเงินจริง");
  const account = await getBillingAccount(db, input.organizationId);
  if (!account) throw new BillingError("ACCOUNT_MISSING", "ยังไม่มีบัญชีการเงินสำหรับองค์กรนี้", 404);
  const payment = await db.payment.create({ data: {
    organizationId: input.organizationId, billingAccountId: account.id, paymentNumber: input.paymentNumber.trim(),
    paymentMethodId: await idByCode(db, "paymentMethod", input.methodCode), statusId: await idByCode(db, "paymentStatus", "PENDING"),
    amount: parsePositiveAmount(input.amount), currency: account.currency, paidAt: input.paidAt ?? new Date(),
    referenceNumber: input.referenceNumber?.trim() || null, evidenceUrl: input.evidenceUrl?.trim() || null,
    notes: input.notes?.trim() || null, recordedBy: input.actorAuthUserId,
  }, include: { status: true, paymentMethod: true } });
  await writeAuditLog(db, { organizationId: input.organizationId, actorAuthUserId: input.actorAuthUserId, actionCode: "billing.payment.record", entityType: "payment", entityId: payment.id, after: { amount: payment.amount.toFixed(2), status: "PENDING" } });
  return payment;
}

export async function confirmPayment(db: PrismaClient, paymentId: string, actorAuthUserId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { status: true } });
  if (!payment) throw new BillingError("NOT_FOUND", "ไม่พบรายการชำระเงิน", 404);
  if (payment.status.code !== "PENDING") throw new BillingError("INVALID_STATE", "ยืนยันได้เฉพาะรายการรอดำเนินการ");
  const updated = await db.payment.update({ where: { id: paymentId }, data: { statusId: await idByCode(db, "paymentStatus", "CONFIRMED"), confirmedBy: actorAuthUserId, confirmedAt: new Date() }, include: { status: true, paymentMethod: true } });
  await writeAuditLog(db, { organizationId: payment.organizationId, actorAuthUserId, actionCode: "billing.payment.confirm", entityType: "payment", entityId: paymentId, after: { status: "CONFIRMED" } });
  return updated;
}

export async function allocatePayment(db: PrismaClient, input: { paymentId: string; invoiceId: string; amount: unknown; actorAuthUserId: string }) {
  const [payment, invoice] = await Promise.all([db.payment.findUnique({ where: { id: input.paymentId }, include: { status: true, allocations: true } }), db.invoice.findUnique({ where: { id: input.invoiceId }, include: { status: true } })]);
  if (!payment || !invoice) throw new BillingError("NOT_FOUND", "ไม่พบรายการชำระเงินหรือใบแจ้งหนี้", 404);
  if (payment.organizationId !== invoice.organizationId) throw new BillingError("ORG_MISMATCH", "ข้อมูลอยู่คนละองค์กร");
  if (payment.status.code !== "CONFIRMED") throw new BillingError("INVALID_STATE", "ต้องยืนยันรายการชำระเงินก่อนจัดสรร");
  const amount = parsePositiveAmount(input.amount);
  const allocated = payment.allocations.reduce((sum, row) => sum.plus(row.amount), amount.minus(amount));
  if (allocated.plus(amount).gt(payment.amount) || amount.gt(invoice.outstandingTotal)) throw new BillingError("ALLOCATION_EXCEEDS_AVAILABLE", "จำนวนจัดสรรเกินยอดคงเหลือ");
  const allocation = await db.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: invoice.id, amount } });
  await reconcileInvoiceStatus(db, invoice.id);
  await writeAuditLog(db, { organizationId: payment.organizationId, actorAuthUserId: input.actorAuthUserId, actionCode: "billing.payment.allocate", entityType: "payment_allocation", entityId: allocation.id, after: { paymentId: payment.id, invoiceId: invoice.id, amount: amount.toFixed(2) } });
  return allocation;
}

export async function listPayments(db: PrismaClient, organizationId: string) {
  return db.payment.findMany({ where: { organizationId }, include: { status: true, paymentMethod: true, allocations: true }, orderBy: { createdAt: "desc" } });
}
export async function getPayment(db: PrismaClient, organizationId: string, paymentId: string) {
  const row = await db.payment.findFirst({ where: { id: paymentId, organizationId }, include: { status: true, paymentMethod: true, allocations: { include: { invoice: { include: { status: true } } } } } });
  if (!row) throw new BillingError("NOT_FOUND", "ไม่พบรายการชำระเงิน", 404);
  return row;
}
