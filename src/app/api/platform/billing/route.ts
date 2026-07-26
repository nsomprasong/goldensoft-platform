import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { BillingError } from "@/lib/billing/codes";
import {
  billingActionPermission,
  billingActionSchemas,
  parseBillingAction,
  type BillingAction,
} from "@/lib/billing/actions";
import { ensureBillingAccount } from "@/lib/billing/accounts";
import { adjustCredit } from "@/lib/billing/credit";
import {
  createDraftInvoice,
  issueInvoice,
  nextInvoiceNumber,
  updateDraftInvoice,
  voidInvoice,
} from "@/lib/billing/invoices";
import {
  allocatePayment,
  confirmPayment,
  recordManualPayment,
} from "@/lib/billing/payments";
import {
  createBillingContact,
  deactivateBillingContact,
  setPrimaryBillingContact,
  updateBillingContact,
} from "@/lib/billing/contacts";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { requireBillingPermission } from "@/lib/billing/access";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

type ActionData<A extends BillingAction> = z.infer<
  (typeof billingActionSchemas)[A]
>;

async function dispatch(
  action: BillingAction,
  data: ActionData<BillingAction>,
  userId: string,
): Promise<unknown> {
  switch (action) {
    case "createAccount": {
      const body = data as ActionData<"createAccount">;
      return ensureBillingAccount(prisma, {
        organizationId: body.organizationId,
        actorAuthUserId: userId,
        creditLimit: body.creditLimit,
      });
    }
    case "adjustCredit": {
      const body = data as ActionData<"adjustCredit">;
      return adjustCredit(prisma, {
        organizationId: body.organizationId,
        actorAuthUserId: userId,
        direction: body.direction,
        amount: body.amount,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
        allowCreateAccount: false,
      });
    }
    case "createInvoice": {
      const body = data as ActionData<"createInvoice">;
      const invoiceNumber =
        body.invoiceNumber?.trim() ||
        (await nextInvoiceNumber(prisma, body.organizationId));
      return createDraftInvoice(prisma, {
        organizationId: body.organizationId,
        actorAuthUserId: userId,
        invoiceNumber,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        items: body.items,
      });
    }
    case "updateInvoice": {
      const body = data as ActionData<"updateInvoice">;
      return updateDraftInvoice(prisma, body.invoiceId, {
        actorAuthUserId: userId,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        items: body.items,
      });
    }
    case "issueInvoice": {
      const body = data as ActionData<"issueInvoice">;
      return issueInvoice(prisma, body.invoiceId, userId);
    }
    case "voidInvoice": {
      const body = data as ActionData<"voidInvoice">;
      return voidInvoice(prisma, body.invoiceId, userId, body.reason);
    }
    case "recordPayment": {
      const body = data as ActionData<"recordPayment">;
      return recordManualPayment(prisma, {
        organizationId: body.organizationId,
        actorAuthUserId: userId,
        paymentNumber: body.paymentNumber,
        amount: body.amount,
        methodCode: body.methodCode,
        referenceNumber: body.referenceNumber ?? null,
      });
    }
    case "confirmPayment": {
      const body = data as ActionData<"confirmPayment">;
      return confirmPayment(prisma, body.paymentId, userId);
    }
    case "allocatePayment": {
      const body = data as ActionData<"allocatePayment">;
      return allocatePayment(prisma, {
        paymentId: body.paymentId,
        invoiceId: body.invoiceId,
        amount: body.amount,
        actorAuthUserId: userId,
      });
    }
    case "createContact": {
      const body = data as ActionData<"createContact">;
      return createBillingContact(
        prisma,
        body.organizationId,
        userId,
        body.contact,
      );
    }
    case "updateContact": {
      const body = data as ActionData<"updateContact">;
      return updateBillingContact(
        prisma,
        body.organizationId,
        body.contactId,
        userId,
        body.contact,
      );
    }
    case "deactivateContact": {
      const body = data as ActionData<"deactivateContact">;
      return deactivateBillingContact(
        prisma,
        body.organizationId,
        body.contactId,
        userId,
      );
    }
    case "setPrimaryContact": {
      const body = data as ActionData<"setPrimaryContact">;
      return setPrimaryBillingContact(
        prisma,
        body.organizationId,
        body.contactId,
        userId,
      );
    }
    default: {
      const _exhaustive: never = action;
      throw new BillingError("UNKNOWN_ACTION", `ไม่รองรับคำสั่ง ${_exhaustive}`);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      throw new BillingError("UNAUTHENTICATED", "เซสชันหมดอายุ", 401);
    }

    const body = await request.json();
    let parsed: ReturnType<typeof parseBillingAction>;
    try {
      parsed = parseBillingAction(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BillingError(
          "VALIDATION_FAILED",
          error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
        );
      }
      const code = error instanceof Error ? error.message : "UNKNOWN_ACTION";
      throw new BillingError(
        code === "UNKNOWN_ACTION" ? "UNKNOWN_ACTION" : "INVALID_BODY",
        code === "UNKNOWN_ACTION"
          ? "คำสั่งการเงินไม่ถูกต้อง"
          : "รูปแบบคำสั่งไม่ถูกต้อง",
      );
    }

    const actor = await loadActorAccess(prisma, user.id);
    const permissions = permissionsForRoles({
      platformRoles: actor.platformRoles,
      organizationRoles: actor.organizationRoles,
    });
    requireBillingPermission(
      permissions,
      billingActionPermission[parsed.action],
    );

    const result = await dispatch(parsed.action, parsed.data, user.id);
    return NextResponse.json(
      { ok: true, action: parsed.action, result },
      { status: 201 },
    );
  } catch (error) {
    const e =
      error instanceof BillingError
        ? error
        : new BillingError(
            "FAILED",
            error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ",
          );
    return NextResponse.json(
      { ok: false, code: e.code, message: e.message },
      { status: e.httpStatus },
    );
  }
}
