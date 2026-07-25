import { NextRequest, NextResponse } from "next/server";

import { requireApplicationContext } from "@/lib/auth/request-auth";

export async function GET(request: NextRequest) {
  const productCode =
    request.nextUrl.searchParams.get("productCode") ?? "RESIDENT";

  const result = await requireApplicationContext(request, productCode);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ context: result.ctx });
}
