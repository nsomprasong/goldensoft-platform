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
  transferPrimaryStaffOrganizationAssignment,
} from "@/lib/platform/customer-portfolio";
import { resolveEffectivePermissionCodes } from "@/lib/permissions/effective";
import { prisma } from "@/lib/prisma";

const assignSchema = z.object({
  staffUserProfileId: z.string().uuid(),
  organizationId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
  assignmentRoleCode: z.enum(["CO_OWNER", "SUPPORT"]).optional(),
  scopeTypeCode: z.enum(["ALL_CURRENT_AND_FUTURE", "SELECTED_BRANCHES"]).optional(),
  branchIds: z.array(z.string().uuid()).max(200).optional(),
});

const revokeSchema = z.object({
  assignmentId: z.string().uuid(),
});
const transferSchema = z.object({
  assignmentId: z.string().uuid(),
  targetStaffUserProfileId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});

async function portfolioActor(authUserId: string) {
  const actor = await loadActorAccess(prisma, authUserId);
  const permissionCodes = await resolveEffectivePermissionCodes(prisma, authUserId, null);
  return { ...actor, permissionCodes };
}

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
  const actor = await portfolioActor(user.id);
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
      assignmentRole: row.assignmentRole,
      scopeType: row.scopeType,
      status: row.status,
      branches: row.branchScopes,
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

  const actor = await portfolioActor(user.id);
  try {
    const created = await assignStaffToOrganization(prisma, {
      actor: { authUserId: user.id, profileId: actor.profileId, platformRoles: actor.platformRoles, permissionCodes: actor.permissionCodes },
      staffUserProfileId: parsed.data.staffUserProfileId,
      organizationId: parsed.data.organizationId,
      note: parsed.data.note,
      assignmentRoleCode: parsed.data.assignmentRoleCode,
      scopeTypeCode: parsed.data.scopeTypeCode,
      branchIds: parsed.data.branchIds,
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

  const actor = await portfolioActor(user.id);
  try {
    const updated = await revokeStaffOrganizationAssignment(prisma, {
      actor: { authUserId: user.id, profileId: actor.profileId, platformRoles: actor.platformRoles, permissionCodes: actor.permissionCodes },
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

export async function PATCH(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: TH.common.sessionExpired }, { status: 401 });
  const parsed = transferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", message: TH.common.failed }, { status: 400 });
  const actor = await portfolioActor(user.id);
  try {
    const result = await transferPrimaryStaffOrganizationAssignment(prisma, {
      actor: { authUserId: user.id, profileId: actor.profileId, platformRoles: actor.platformRoles, permissionCodes: actor.permissionCodes },
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof CustomerPortfolioError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 403 });
    }
    throw error;
  }
}
