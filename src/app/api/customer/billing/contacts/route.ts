import { NextRequest, NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/codes";
import { customerBillingContext } from "@/lib/billing/request-context";
import { listBillingContacts } from "@/lib/billing/contacts";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  try { const ctx = await customerBillingContext(request); if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.billingContactRead)) throw new BillingError("FORBIDDEN", "คุณไม่มีสิทธิ์ดูผู้ติดต่อการเงิน", 403); return NextResponse.json({ contacts: await listBillingContacts(prisma, ctx.organizationId) }); }
  catch (error) { const e = error instanceof BillingError ? error : new BillingError("FAILED", "ไม่สามารถโหลดผู้ติดต่อ", 400); return NextResponse.json({ code: e.code, message: e.message }, { status: e.httpStatus }); }
}
