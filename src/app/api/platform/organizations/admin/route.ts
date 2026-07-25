import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  OrganizationAdminError,
  createOrganization,
  listOrganizationsForActor,
} from "@/lib/platform/organizations-admin";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.organizationRead)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  const url = request.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const take = 20;
  const result = await listOrganizationsForActor(prisma, actor, {
    q: url.searchParams.get("q") ?? undefined,
    statusCode: url.searchParams.get("status") ?? undefined,
    skip: (page - 1) * take,
    take,
  });

  return NextResponse.json({
    total: result.total,
    page,
    pageSize: take,
    organizations: result.rows.map((o) => ({
      id: o.id,
      customerCode: o.customerCode,
      slug: o.slug,
      displayName: o.displayName,
      legalName: o.legalName,
      taxId: o.taxId,
      status: o.status.code,
      branchCount: o._count.branches,
      membershipCount: o._count.memberships,
      subscriptionCount: o._count.subscriptions,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json();
  try {
    const created = await createOrganization(prisma, actor, body);
    return NextResponse.json(
      { message: TH.common.saved, organization: { id: created.id } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrganizationAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "CODE_DUPLICATE"
            ? 409
            : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: TH.common.failed }, { status: 400 });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
