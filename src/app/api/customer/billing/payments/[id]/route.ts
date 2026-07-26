import { NextRequest, NextResponse } from "next/server";

import { BillingError } from "@/lib/billing/codes";
import { customerBillingContext } from "@/lib/billing/request-context";
import { getPayment } from "@/lib/billing/payments";
import { serializePayment } from "@/lib/billing/serialize";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await customerBillingContext(request);
    if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.billingPaymentRead)) {
      throw new BillingError("FORBIDDEN", "คุณไม่มีสิทธิ์ดูการชำระเงิน", 403);
    }
    const { id } = await context.params;
    const payment = await getPayment(prisma, ctx.organizationId, id);
    return NextResponse.json({ payment: serializePayment(payment) });
  } catch (error) {
    const e =
      error instanceof BillingError
        ? error
        : new BillingError("FAILED", "ไม่สามารถโหลดการชำระเงิน", 400);
    return NextResponse.json(
      { code: e.code, message: e.message },
      { status: e.httpStatus },
    );
  }
}
