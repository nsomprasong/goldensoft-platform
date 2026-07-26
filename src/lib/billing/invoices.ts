import { Prisma, type PrismaClient } from "@prisma/client";

import { getBillingAccount } from "@/lib/billing/accounts";
import { BillingError, BILLING_CODES } from "@/lib/billing/codes";
import { money, parseNonNegativeAmount, serializeMoney } from "@/lib/billing/money";
import { writeAuditLog } from "@/lib/platform/audit";

type Db = PrismaClient | Prisma.TransactionClient;
type ItemInput = {
  description: string;
  quantity?: string | number;
  unitPrice: string | number;
  discountAmount?: string | number;
  taxAmount?: string | number;
  itemType?: string;
};

async function statusId(db: Db, code: string) {
  const status = await db.invoiceStatus.findUnique({ where: { code } });
  if (!status) throw new BillingError("MASTER_MISSING", "ไม่พบสถานะใบแจ้งหนี้", 500);
  return status.id;
}

function calculate(items: ItemInput[]) {
  if (!items.length) throw new BillingError("ITEMS_REQUIRED", "ต้องมีรายการอย่างน้อยหนึ่งรายการ");
  return items.map((item, sortOrder) => {
    if (!item.description.trim()) throw new BillingError("DESCRIPTION_REQUIRED", "ต้องระบุรายละเอียดรายการ");
    const quantity = money(item.quantity ?? 1);
    if (quantity.lte(0)) throw new BillingError("INVALID_QUANTITY", "จำนวนต้องมากกว่าศูนย์");
    const unitPrice = parseNonNegativeAmount(item.unitPrice);
    const discountAmount = parseNonNegativeAmount(item.discountAmount);
    const taxAmount = parseNonNegativeAmount(item.taxAmount);
    const lineTotal = quantity.mul(unitPrice).minus(discountAmount).plus(taxAmount).toDecimalPlaces(2);
    if (lineTotal.lt(0)) throw new BillingError("INVALID_LINE_TOTAL", "ยอดรายการต้องไม่ติดลบ");
    return { ...item, quantity, unitPrice, discountAmount, taxAmount, lineTotal, sortOrder };
  });
}

function totals(items: ReturnType<typeof calculate>) {
  const subtotal = items.reduce((sum, item) => sum.plus(item.quantity.mul(item.unitPrice)), money(0));
  const discountTotal = items.reduce((sum, item) => sum.plus(item.discountAmount), money(0));
  const taxTotal = items.reduce((sum, item) => sum.plus(item.taxAmount), money(0));
  return { subtotal, discountTotal, taxTotal, grandTotal: subtotal.minus(discountTotal).plus(taxTotal) };
}

/** Deterministic, concurrency-safe invoice number: INV-{customerCode}-{yyyyMM}-{seq}. */
export async function nextInvoiceNumber(
  db: Db,
  organizationId: string,
): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { customerCode: true },
  });
  if (!org?.customerCode) {
    throw new BillingError("ORG_NOT_FOUND", "ไม่พบองค์กร", 404);
  }
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-${org.customerCode}-${yyyymm}-`;
  const latest = await db.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const lastSeq = latest
    ? Number(latest.invoiceNumber.slice(prefix.length)) || 0
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function createDraftInvoice(
  db: PrismaClient,
  input: {
    organizationId: string;
    actorAuthUserId: string;
    invoiceNumber?: string;
    dueDate?: Date | null;
    notes?: string | null;
    items: ItemInput[];
  },
) {
  const account = await getBillingAccount(db, input.organizationId);
  if (!account) {
    throw new BillingError(
      "ACCOUNT_MISSING",
      "ยังไม่มีบัญชีการเงินสำหรับองค์กรนี้",
      404,
    );
  }
  const rows = calculate(input.items);
  const total = totals(rows);
  const fixedNumber = input.invoiceNumber?.trim() || null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const invoiceNumber =
      fixedNumber ?? (await nextInvoiceNumber(db, input.organizationId));
    try {
      const invoice = await db.invoice.create({
        data: {
          organizationId: input.organizationId,
          billingAccountId: account.id,
          invoiceNumber,
          currency: account.currency,
          statusId: await statusId(db, BILLING_CODES.invoiceStatus.DRAFT),
          dueDate: input.dueDate ?? null,
          notes: input.notes?.trim() || null,
          createdBy: input.actorAuthUserId,
          ...total,
          outstandingTotal: total.grandTotal,
          items: {
            create: rows.map((row) => ({
              description: row.description.trim(),
              itemType: row.itemType ?? "MANUAL",
              quantity: row.quantity,
              unitPrice: row.unitPrice,
              discountAmount: row.discountAmount,
              taxAmount: row.taxAmount,
              lineTotal: row.lineTotal,
              sortOrder: row.sortOrder,
            })),
          },
        },
        include: { status: true, items: true },
      });
      await writeAuditLog(db, {
        organizationId: input.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionCode: "billing.invoice.create",
        entityType: "invoice",
        entityId: invoice.id,
        after: {
          invoiceNumber: invoice.invoiceNumber,
          grandTotal: serializeMoney(invoice.grandTotal),
        },
      });
      return invoice;
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!isUnique || fixedNumber) throw error;
    }
  }
  throw new BillingError(
    "INVOICE_NUMBER_COLLISION",
    "ไม่สามารถสร้างเลขใบแจ้งหนี้ที่ไม่ซ้ำได้",
  );
}

export async function updateDraftInvoice(db: PrismaClient, invoiceId: string, input: Omit<Parameters<typeof createDraftInvoice>[1], "organizationId" | "actorAuthUserId" | "invoiceNumber"> & { actorAuthUserId: string }) {
  const existing = await db.invoice.findUnique({ where: { id: invoiceId }, include: { status: true } });
  if (!existing) throw new BillingError("NOT_FOUND", "ไม่พบใบแจ้งหนี้", 404);
  if (existing.status.code !== BILLING_CODES.invoiceStatus.DRAFT) throw new BillingError("INVALID_STATE", "แก้ไขได้เฉพาะใบแจ้งหนี้ฉบับร่าง");
  const rows = calculate(input.items); const total = totals(rows);
  const invoice = await db.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({ where: { id: invoiceId }, data: { ...total, outstandingTotal: total.grandTotal, dueDate: input.dueDate ?? null, notes: input.notes?.trim() || null, items: { create: rows.map((row) => ({ description: row.description.trim(), itemType: row.itemType ?? "MANUAL", quantity: row.quantity, unitPrice: row.unitPrice, discountAmount: row.discountAmount, taxAmount: row.taxAmount, lineTotal: row.lineTotal, sortOrder: row.sortOrder })) } }, include: { status: true, items: true } });
  });
  await writeAuditLog(db, { organizationId: invoice.organizationId, actorAuthUserId: input.actorAuthUserId, actionCode: "billing.invoice.update", entityType: "invoice", entityId: invoice.id, before: { grandTotal: serializeMoney(existing.grandTotal) }, after: { grandTotal: serializeMoney(invoice.grandTotal) } });
  return invoice;
}

export async function issueInvoice(db: PrismaClient, invoiceId: string, actorAuthUserId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { status: true } });
  if (!invoice) throw new BillingError("NOT_FOUND", "ไม่พบใบแจ้งหนี้", 404);
  if (invoice.status.code !== "DRAFT") throw new BillingError("INVALID_STATE", "ออกใบแจ้งหนี้ได้เฉพาะฉบับร่าง");
  const updated = await db.invoice.update({ where: { id: invoiceId }, data: { statusId: await statusId(db, "ISSUED"), issueDate: new Date() }, include: { status: true, items: true } });
  await writeAuditLog(db, { organizationId: invoice.organizationId, actorAuthUserId, actionCode: "billing.invoice.issue", entityType: "invoice", entityId: invoiceId, after: { status: "ISSUED" } });
  return updated;
}

export async function voidInvoice(db: PrismaClient, invoiceId: string, actorAuthUserId: string, reason: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { status: true } });
  if (!invoice) throw new BillingError("NOT_FOUND", "ไม่พบใบแจ้งหนี้", 404);
  if (invoice.paidTotal.gt(0)) throw new BillingError("INVALID_STATE", "ไม่สามารถโมฆะใบแจ้งหนี้ที่มีการชำระแล้ว");
  const updated = await db.invoice.update({ where: { id: invoiceId }, data: { statusId: await statusId(db, "VOID"), notes: [invoice.notes, `VOID: ${reason.trim()}`].filter(Boolean).join("\n") }, include: { status: true } });
  await writeAuditLog(db, { organizationId: invoice.organizationId, actorAuthUserId, actionCode: "billing.invoice.void", entityType: "invoice", entityId: invoiceId, after: { status: "VOID", reason } });
  return updated;
}

export async function reconcileInvoiceStatus(db: Db, invoiceId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { status: true, allocations: true } });
  if (!invoice) throw new BillingError("NOT_FOUND", "ไม่พบใบแจ้งหนี้", 404);
  if (["VOID", "CANCELLED", "DRAFT"].includes(invoice.status.code)) return invoice;
  const paidTotal = invoice.allocations.reduce((sum, row) => sum.plus(row.amount), money(0));
  const candidateOutstanding = invoice.grandTotal.minus(paidTotal);
  const outstandingTotal = candidateOutstanding.lt(0) ? money(0) : candidateOutstanding;
  const code = outstandingTotal.eq(0) ? "PAID" : paidTotal.gt(0) ? "PARTIALLY_PAID" : invoice.dueDate && invoice.dueDate < new Date() ? "OVERDUE" : "ISSUED";
  return db.invoice.update({ where: { id: invoiceId }, data: { paidTotal, outstandingTotal, paidAt: code === "PAID" ? new Date() : null, statusId: await statusId(db, code) }, include: { status: true, items: true, allocations: true } });
}

export async function listInvoices(db: Db, organizationId: string) {
  return db.invoice.findMany({ where: { organizationId }, include: { status: true, items: true }, orderBy: { createdAt: "desc" } });
}
export async function getInvoice(db: Db, organizationId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { status: true, items: true, allocations: { include: { payment: { include: { status: true, paymentMethod: true } } } } } });
  if (!invoice) throw new BillingError("NOT_FOUND", "ไม่พบใบแจ้งหนี้", 404);
  return invoice;
}
