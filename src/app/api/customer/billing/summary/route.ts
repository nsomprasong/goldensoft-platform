import { NextRequest, NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/codes";
import { customerBillingContext } from "@/lib/billing/request-context";
import { getBillingSummary } from "@/lib/billing/summary";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  try { const ctx = await customerBillingContext(request); return NextResponse.json(await getBillingSummary(prisma, ctx.organizationId, ctx.permissions)); }
  catch (error) { const e = error instanceof BillingError ? error : new BillingError("FAILED", "ไม่สามารถโหลดข้อมูลการเงิน", 400); return NextResponse.json({ code: e.code, message: e.message }, { status: e.httpStatus }); }
}
