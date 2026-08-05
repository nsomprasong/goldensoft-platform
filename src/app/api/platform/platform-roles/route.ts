import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import {
  assignPlatformRole,
  listAssignablePlatformRoles,
  PlatformRoleAssignError,
  revokePlatformRole,
} from "@/lib/platform/platform-roles";
import { prisma } from "@/lib/prisma";

const assignSchema = z.object({
  userProfileId: z.string().uuid(),
  roleId: z.string().uuid(),
});

const revokeSchema = z.object({
  assignmentId: z.string().uuid(),
});

function errorStatus(code: string): number {
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  return 400;
}

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  const permissions = await resolveActorPermissionCodes(prisma, {
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  });
  if (!permissions.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.access.deniedBody },
      { status: 403 },
    );
  }
  const roles = await listAssignablePlatformRoles(prisma);
  return NextResponse.json(
    { scope: "platform", roles },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
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
    const assignment = await assignPlatformRole(prisma, {
      actor: { platformRoles: actor.platformRoles },
      actorAuthUserId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformRoleAssignError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: errorStatus(error.code) },
      );
    }
    console.error("assignPlatformRole failed", error);
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "กำหนดบทบาทแพลตฟอร์มไม่สำเร็จ" },
      { status: 500 },
    );
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
    await revokePlatformRole(prisma, {
      actor: { platformRoles: actor.platformRoles },
      actorAuthUserId: user.id,
      assignmentId: parsed.data.assignmentId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PlatformRoleAssignError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: errorStatus(error.code) },
      );
    }
    console.error("revokePlatformRole failed", error);
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "ถอดบทบาทแพลตฟอร์มไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
