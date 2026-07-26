import type { PrismaClient } from "@prisma/client";

import { BillingError } from "@/lib/billing/codes";
import { writeAuditLog } from "@/lib/platform/audit";

type ContactInput = {
  name: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  isPrimary?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

function clean(input: ContactInput) {
  if (!input.name.trim() || !input.email.trim()) {
    throw new BillingError(
      "CONTACT_REQUIRED",
      "ต้องระบุชื่อและอีเมลผู้ติดต่อ",
    );
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new BillingError("INVALID_EMAIL", "รูปแบบอีเมลไม่ถูกต้อง");
  }
  const phone = input.phone?.trim() || null;
  if (phone && !PHONE_RE.test(phone)) {
    throw new BillingError("INVALID_PHONE", "รูปแบบเบอร์โทรไม่ถูกต้อง");
  }
  return {
    name: input.name.trim(),
    email,
    phone,
    title: input.title?.trim() || null,
    isPrimary: Boolean(input.isPrimary),
  };
}
export async function listBillingContacts(db: PrismaClient, organizationId: string) {
  return db.billingContact.findMany({ where: { organizationId }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] });
}
export async function createBillingContact(db: PrismaClient, organizationId: string, actorAuthUserId: string, input: ContactInput) {
  const data = clean(input);
  return db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.billingContact.updateMany({ where: { organizationId }, data: { isPrimary: false } });
    const row = await tx.billingContact.create({ data: { organizationId, ...data } });
    await writeAuditLog(tx, { organizationId, actorAuthUserId, actionCode: "billing.contact.create", entityType: "billing_contact", entityId: row.id, after: { email: row.email, isPrimary: row.isPrimary } });
    return row;
  });
}
export async function updateBillingContact(db: PrismaClient, organizationId: string, id: string, actorAuthUserId: string, input: ContactInput) {
  const existing = await db.billingContact.findFirst({ where: { id, organizationId } });
  if (!existing) throw new BillingError("NOT_FOUND", "ไม่พบผู้ติดต่อการเงิน", 404);
  const data = clean(input);
  return db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.billingContact.updateMany({ where: { organizationId, id: { not: id } }, data: { isPrimary: false } });
    const row = await tx.billingContact.update({ where: { id }, data });
    await writeAuditLog(tx, { organizationId, actorAuthUserId, actionCode: "billing.contact.update", entityType: "billing_contact", entityId: id, before: { email: existing.email }, after: { email: row.email, isPrimary: row.isPrimary } });
    return row;
  });
}
export async function deactivateBillingContact(db: PrismaClient, organizationId: string, id: string, actorAuthUserId: string) {
  const row = await db.billingContact.updateMany({ where: { id, organizationId }, data: { isActive: false, isPrimary: false } });
  if (!row.count) throw new BillingError("NOT_FOUND", "ไม่พบผู้ติดต่อการเงิน", 404);
  await writeAuditLog(db, { organizationId, actorAuthUserId, actionCode: "billing.contact.deactivate", entityType: "billing_contact", entityId: id, after: { isActive: false } });
}
export async function setPrimaryBillingContact(db: PrismaClient, organizationId: string, id: string, actorAuthUserId: string) {
  const contact = await db.billingContact.findFirst({ where: { id, organizationId, isActive: true } });
  if (!contact) throw new BillingError("NOT_FOUND", "ไม่พบผู้ติดต่อที่ใช้งานได้", 404);
  return db.$transaction(async (tx) => {
    await tx.billingContact.updateMany({ where: { organizationId }, data: { isPrimary: false } });
    const row = await tx.billingContact.update({ where: { id }, data: { isPrimary: true } });
    await writeAuditLog(tx, { organizationId, actorAuthUserId, actionCode: "billing.contact.set_primary", entityType: "billing_contact", entityId: id, after: { isPrimary: true } });
    return row;
  });
}
