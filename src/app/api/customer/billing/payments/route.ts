import { NextRequest, NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/codes";
import { customerBillingContext } from "@/lib/billing/request-context";
import { listPayments } from "@/lib/billing/payments";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  try { const ctx = await customerBillingContext(request); if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.billingPaymentRead)) throw new BillingError("FORBIDDEN", "คุณไม่มีสิทธิ์ดูการชำระเงิน", 403); return NextResponse.json({ payments: await listPayments(prisma, ctx.organizationId) }); }
  catch (error) { const e = error instanceof BillingError ? error : new BillingError("FAILED", "ไม่สามารถโหลดการชำระเงิน", 400); return NextResponse.json({ code: e.code, message: e.message }, { status: e.httpStatus }); }
}
