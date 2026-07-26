import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  assignStaffToOrganization,
  CustomerPortfolioError,
  canManagePortfolioAssignments,
  listStaffOrganizationAssignments,
  revokeStaffOrganizationAssignment,
} from "@/lib/platform/customer-portfolio";
import { prisma } from "@/lib/prisma";

const assignSchema = z.object({
  staffUserProfileId: z.string().uuid(),
  organizationId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});

const revokeSchema = z.object({
  assignmentId: z.string().uuid(),
});

/**
 * Staff ↔ customer-organization portfolio assignments (Phase 1).
 * Only SUPER_ADMIN (or a role granted platform.customer_portfolio.manage)
 * may list/assign/revoke — staff never become organization_memberships.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  if (!canManagePortfolioAssignments(actor)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
    );
  }

  const url = request.nextUrl;
  const rows = await listStaffOrganizationAssignments(prisma, {
    staffUserProfileId: url.searchParams.get("staffUserProfileId") ?? undefined,
    organizationId: url.searchParams.get("organizationId") ?? undefined,
  });

  return NextResponse.json({
    assignments: rows.map((row) => ({
      id: row.id,
      staffUserProfileId: row.staffUserProfileId,
      organizationId: row.organizationId,
      assignedAt: row.assignedAt,
      revokedAt: row.revokedAt,
      note: row.note,
      staff: row.staffUserProfile,
      organization: row.organization,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  try {
    const created = await assignStaffToOrganization(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      staffUserProfileId: parsed.data.staffUserProfileId,
      organizationId: parsed.data.organizationId,
      note: parsed.data.note,
    });
    return NextResponse.json(
      { ok: true, message: TH.staffPortfolio.assignSuccess, assignment: created },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CustomerPortfolioError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : 400;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  try {
    const updated = await revokeStaffOrganizationAssignment(prisma, {
      actor: { authUserId: user.id, platformRoles: actor.platformRoles },
      assignmentId: parsed.data.assignmentId,
    });
    return NextResponse.json({
      ok: true,
      message: TH.staffPortfolio.revokeSuccess,
      assignment: updated,
    });
  } catch (error) {
    if (error instanceof CustomerPortfolioError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    throw error;
  }
}
