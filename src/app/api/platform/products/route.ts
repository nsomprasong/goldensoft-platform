import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  ProductAdminError,
  createProduct,
  listProducts,
} from "@/lib/platform/products-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const url = request.nextUrl;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const take = 50;
    const result = await listProducts(prisma, actor, {
      q: url.searchParams.get("q") ?? undefined,
      statusCode: url.searchParams.get("status") ?? undefined,
      skip: (page - 1) * take,
      take,
    });
    return NextResponse.json({
      total: result.total,
      page,
      pageSize: take,
      products: result.rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        nameTh: p.nameTh,
        nameEn: p.nameEn,
        productType: p.productType,
        sortOrder: p.sortOrder,
        status: p.status.code,
        planCount: p._count.plans,
        featureCount: p._count.features,
        subscriptionCount: p._count.subscriptions,
      })),
    });
  } catch (error) {
    if (error instanceof ProductAdminError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const body = await request.json();
    const product = await createProduct(prisma, actor, body);
    return NextResponse.json(
      { message: TH.common.saved, product: { id: product.id, code: product.code } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProductAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "CODE_DUPLICATE"
            ? 409
            : 400;
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
