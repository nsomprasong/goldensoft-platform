import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { CustomRoleError, updateStandardRoleTemplate } from "@/lib/platform/custom-roles";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({
  nameTh: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  permissionCodes: z.array(z.string().min(3)).min(1),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requireAuthUser(request);
  if (!user) return NextResponse.json({ message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "ข้อมูลแม่แบบไม่ถูกต้อง" }, { status: 400 });
  try {
    const role = await updateStandardRoleTemplate(prisma, {
      actor: await loadActorAccess(prisma, user.id),
      actorAuthUserId: user.id,
      roleId: (await params).id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, role });
  } catch (error) {
    if (error instanceof CustomRoleError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
    }
    console.error("updateStandardRoleTemplate failed", error);
    return NextResponse.json({ message: "บันทึกแม่แบบบทบาทมาตรฐานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
