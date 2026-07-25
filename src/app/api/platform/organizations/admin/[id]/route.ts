import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  OrganizationAdminError,
  canManageOrganization,
  suspendOrganization,
  updateOrganization,
} from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  if (!canManageOrganization(actor, id) && !actor.membershipOrganizationIds.includes(id) && !actor.platformRoles.includes("SUPPORT") && !actor.platformRoles.includes("SUPER_ADMIN")) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      customerCode: true,
      slug: true,
      displayName: true,
      legalName: true,
      taxId: true,
      createdAt: true,
      updatedAt: true,
      status: { select: { code: true } },
    },
  });
  if (!org) {
    return NextResponse.json({ message: TH.common.notFound }, { status: 404 });
  }
  if (
    !actor.platformRoles.includes("SUPER_ADMIN") &&
    !actor.platformRoles.includes("SUPPORT") &&
    !actor.membershipOrganizationIds.includes(id)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  return NextResponse.json({
    organization: {
      id: org.id,
      customerCode: org.customerCode,
      slug: org.slug,
      displayName: org.displayName,
      legalName: org.legalName,
      taxId: org.taxId,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      status: org.status.code,
    },
  });
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json();
  try {
    const updated = await updateOrganization(prisma, actor, id, body);
    return NextResponse.json({ message: TH.common.saved, id: updated.id });
  } catch (error) {
    if (error instanceof OrganizationAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; action?: string };
  if (body.action && body.action !== "suspend") {
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
  try {
    await suspendOrganization(prisma, actor, id, { force: body.force === true });
    return NextResponse.json({ message: TH.common.saved });
  } catch (error) {
    if (error instanceof OrganizationAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "SUSPEND_WARNING"
              ? 409
              : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
