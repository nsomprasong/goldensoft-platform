import { NextRequest, NextResponse } from "next/server";

import { BillingError } from "@/lib/billing/codes";
import { customerBillingContext } from "@/lib/billing/request-context";
import { getInvoice } from "@/lib/billing/invoices";
import { serializeInvoice } from "@/lib/billing/serialize";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await customerBillingContext(request);
    if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.billingInvoiceRead)) {
      throw new BillingError("FORBIDDEN", "คุณไม่มีสิทธิ์ดูใบแจ้งหนี้", 403);
    }
    const { id } = await context.params;
    const invoice = await getInvoice(prisma, ctx.organizationId, id);
    return NextResponse.json({ invoice: serializeInvoice(invoice) });
  } catch (error) {
    const e =
      error instanceof BillingError
        ? error
        : new BillingError("FAILED", "ไม่สามารถโหลดใบแจ้งหนี้", 400);
    return NextResponse.json(
      { code: e.code, message: e.message },
      { status: e.httpStatus },
    );
  }
}
