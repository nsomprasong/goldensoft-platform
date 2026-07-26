import { NextRequest, NextResponse } from "next/server";

import { BillingError } from "@/lib/billing/codes";
import {
  getCreditBalance,
  listCreditTransactions,
  serializeCreditTransaction,
} from "@/lib/billing/credit";
import { serializeMoney } from "@/lib/billing/money";
import { requireBillingPermission } from "@/lib/billing/access";
import { customerBillingContext } from "@/lib/billing/request-context";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const ctx = await customerBillingContext(request);
    requireBillingPermission(
      ctx.permissions,
      PLATFORM_PERMISSIONS.billingCreditRead,
    );
    const balance = await getCreditBalance(prisma, ctx.organizationId);
    if (!balance) {
      return NextResponse.json({
        hasBillingAccount: false,
        balance: null,
        transactions: [],
        total: 0,
      });
    }
    const url = request.nextUrl;
    const listed = await listCreditTransactions(prisma, {
      organizationId: ctx.organizationId,
      transactionTypeCode: url.searchParams.get("type") ?? undefined,
      skip: Math.max(0, Number(url.searchParams.get("skip") ?? "0") || 0),
      take: Math.min(100, Number(url.searchParams.get("take") ?? "50") || 50),
    });
    return NextResponse.json({
      hasBillingAccount: true,
      balance: {
        balance: serializeMoney(balance.balance),
        creditLimit: serializeMoney(balance.creditLimit),
        availableCredit: serializeMoney(balance.availableCredit),
        currency: balance.currency,
        status: balance.status,
      },
      total: listed.total,
      transactions: listed.rows.map(serializeCreditTransaction),
    });
  } catch (error) {
    const e =
      error instanceof BillingError
        ? error
        : new BillingError("FAILED", "ไม่สามารถโหลดเครดิต", 400);
    return NextResponse.json(
      { code: e.code, message: e.message },
      { status: e.httpStatus },
    );
  }
}
