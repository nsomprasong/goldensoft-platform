import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  ProductAdminError,
  getProduct,
  setProductStatus,
  updateProduct,
} from "@/lib/platform/products-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !perms.includes(PLATFORM_PERMISSIONS.productRead)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const product = await getProduct(prisma, id);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof ProductAdminError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  try {
    const body = await request.json();
    const product = await updateProduct(prisma, actor, id, body);
    return NextResponse.json({
      message: TH.common.saved,
      product: { id: product.id },
    });
  } catch (error) {
    if (error instanceof ProductAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
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

export async function POST(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const { id } = await context.params;
  const body = (await request.json()) as { action?: string };
  try {
    if (body.action === "activate") {
      await setProductStatus(prisma, actor, id, MASTER.productStatus.ACTIVE);
    } else if (body.action === "deactivate") {
      await setProductStatus(prisma, actor, id, MASTER.productStatus.RETIRED);
    } else {
      return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.saved });
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
