import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  assignMembershipRole,
  revokeMembershipRole,
  RoleAssignmentError,
} from "@/lib/platform/membership-roles";
import { prisma } from "@/lib/prisma";

const assignSchema = z.object({
  membershipId: z.string().uuid(),
  roleId: z.string().uuid(),
});

const revokeSchema = z.object({
  membershipRoleId: z.string().uuid(),
});

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
    const row = await assignMembershipRole(prisma, {
      actor,
      actorAuthUserId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, assignment: row }, { status: 201 });
  } catch (error) {
    if (error instanceof RoleAssignmentError) {
      const status = error.code === "FORBIDDEN" ? 403 : 400;
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
    const row = await revokeMembershipRole(prisma, {
      actor,
      actorAuthUserId: user.id,
      membershipRoleId: parsed.data.membershipRoleId,
    });
    return NextResponse.json({ ok: true, assignment: row });
  } catch (error) {
    if (error instanceof RoleAssignmentError) {
      const status = error.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    throw error;
  }
}
