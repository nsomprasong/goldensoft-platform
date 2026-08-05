import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { createPlatformRole, PlatformRoleAssignError, PlatformRoleError } from "@/lib/platform/platform-roles";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  code: z.string().min(2).max(48),
  nameTh: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  permissionCodes: z.array(z.string().min(3)).min(1),
});

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: TH.common.sessionExpired }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", message: TH.common.failed }, { status: 400 });
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const role = await createPlatformRole(prisma, { actor: { platformRoles: actor.platformRoles }, actorAuthUserId: user.id, ...parsed.data });
    return NextResponse.json({ ok: true, scope: "platform", role }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PlatformRoleError || error instanceof PlatformRoleAssignError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw error;
  }
}
