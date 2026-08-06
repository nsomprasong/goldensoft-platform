import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { CustomRoleError, resetStandardRoleOverride } from "@/lib/platform/custom-roles";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ organizationId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: Params) {
  const user = await requireAuthUser(request);
  if (!user) return NextResponse.json({ message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "ข้อมูลองค์กรไม่ถูกต้อง" }, { status: 400 });
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const result = await resetStandardRoleOverride(prisma, {
      actor,
      actorAuthUserId: user.id,
      roleId: (await params).id,
      organizationId: parsed.data.organizationId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CustomRoleError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw error;
  }
}
