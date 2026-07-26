import { NextRequest, NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/codes";
import { ensureBillingAccount } from "@/lib/billing/accounts";
import { adjustCredit } from "@/lib/billing/credit";
import { createDraftInvoice, issueInvoice, updateDraftInvoice, voidInvoice } from "@/lib/billing/invoices";
import { allocatePayment, confirmPayment, recordManualPayment } from "@/lib/billing/payments";
import { createBillingContact, deactivateBillingContact, setPrimaryBillingContact, updateBillingContact } from "@/lib/billing/contacts";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { requireBillingPermission } from "@/lib/billing/access";
import { PLATFORM_PERMISSIONS, permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser(request);
    if (!user) throw new BillingError("UNAUTHENTICATED", "เซสชันหมดอายุ", 401);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const actor = await loadActorAccess(prisma, user.id);
    const permissions = permissionsForRoles({ platformRoles: actor.platformRoles, organizationRoles: actor.organizationRoles });
    const organizationId = String(body.organizationId ?? "");
    if (!organizationId) throw new BillingError("ORG_REQUIRED", "ต้องระบุองค์กร");
    let result: unknown;
    if (action === "createAccount") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingAccountManage); result = await ensureBillingAccount(prisma, { organizationId, actorAuthUserId: user.id, creditLimit: body.creditLimit as string | undefined }); }
    else if (action === "adjustCredit") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingCreditAdjust); result = await adjustCredit(prisma, { organizationId, actorAuthUserId: user.id, direction: body.direction === "DEBIT" ? "DEBIT" : "CREDIT", amount: body.amount, reason: String(body.reason ?? ""), allowCreateAccount: false }); }
    else if (action === "createInvoice") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingInvoiceManage); result = await createDraftInvoice(prisma, { organizationId, actorAuthUserId: user.id, invoiceNumber: String(body.invoiceNumber ?? ""), dueDate: body.dueDate ? new Date(String(body.dueDate)) : null, notes: typeof body.notes === "string" ? body.notes : null, items: Array.isArray(body.items) ? body.items as never[] : [] }); }
    else if (action === "updateInvoice") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingInvoiceManage); result = await updateDraftInvoice(prisma, String(body.invoiceId), { actorAuthUserId: user.id, dueDate: body.dueDate ? new Date(String(body.dueDate)) : null, notes: typeof body.notes === "string" ? body.notes : null, items: Array.isArray(body.items) ? body.items as never[] : [] }); }
    else if (action === "issueInvoice") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingInvoiceManage); result = await issueInvoice(prisma, String(body.invoiceId), user.id); }
    else if (action === "voidInvoice") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingInvoiceManage); result = await voidInvoice(prisma, String(body.invoiceId), user.id, String(body.reason ?? "")); }
    else if (action === "recordPayment") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingPaymentRecord); result = await recordManualPayment(prisma, { organizationId, actorAuthUserId: user.id, paymentNumber: String(body.paymentNumber ?? ""), amount: body.amount, methodCode: String(body.methodCode ?? "BANK_TRANSFER"), referenceNumber: typeof body.referenceNumber === "string" ? body.referenceNumber : null }); }
    else if (action === "confirmPayment") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingPaymentRecord); result = await confirmPayment(prisma, String(body.paymentId), user.id); }
    else if (action === "allocatePayment") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingPaymentRecord); result = await allocatePayment(prisma, { paymentId: String(body.paymentId), invoiceId: String(body.invoiceId), amount: body.amount, actorAuthUserId: user.id }); }
    else if (action === "createContact") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingContactManage); result = await createBillingContact(prisma, organizationId, user.id, body.contact as never); }
    else if (action === "updateContact") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingContactManage); result = await updateBillingContact(prisma, organizationId, String(body.contactId), user.id, body.contact as never); }
    else if (action === "deactivateContact") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingContactManage); result = await deactivateBillingContact(prisma, organizationId, String(body.contactId), user.id); }
    else if (action === "setPrimaryContact") { requireBillingPermission(permissions, PLATFORM_PERMISSIONS.billingContactManage); result = await setPrimaryBillingContact(prisma, organizationId, String(body.contactId), user.id); }
    else throw new BillingError("UNKNOWN_ACTION", "คำสั่งการเงินไม่ถูกต้อง");
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) { const e = error instanceof BillingError ? error : new BillingError("FAILED", error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ"); return NextResponse.json({ code: e.code, message: e.message }, { status: e.httpStatus }); }
}
