import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  BranchScopeError,
  setMembershipBranchScope,
} from "@/lib/platform/membership-branch-scopes";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  membershipId: z.string().uuid(),
  scopeTypeCode: z.enum(["ALL_BRANCHES", "SELECTED", "NONE"]),
  branchIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const result = await setMembershipBranchScope(prisma, {
      actor,
      actorAuthUserId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ message: TH.common.saved, ...result });
  } catch (error) {
    if (error instanceof BranchScopeError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
