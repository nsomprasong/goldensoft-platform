import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  BranchAdminError,
  suspendBranch,
  updateBranch,
} from "@/lib/platform/branches-admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; branchId: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id, branchId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json();
  try {
    const updated = await updateBranch(prisma, actor, id, branchId, body);
    return NextResponse.json({ message: TH.common.saved, id: updated.id });
  } catch (error) {
    if (error instanceof BranchAdminError) {
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
  const { id, branchId } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  try {
    await suspendBranch(prisma, actor, id, branchId);
    return NextResponse.json({ message: TH.common.saved });
  } catch (error) {
    if (error instanceof BranchAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "PRIMARY_REQUIRED"
              ? 409
              : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
