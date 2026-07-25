import { NextRequest, NextResponse } from "next/server";

import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  UserInvitationError,
  acceptInvitationForAuthUser,
} from "@/lib/platform/user-invitations";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { message: "คำเชิญไม่ถูกต้องหรือหมดอายุ" },
      { status: 401 },
    );
  }
  try {
    await acceptInvitationForAuthUser(prisma, user.id);
    return NextResponse.json({ message: "ตั้งรหัสผ่านสำเร็จ" });
  } catch (error) {
    if (error instanceof UserInvitationError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "INVITE_NOT_READY" ? 409 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }
}
