import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  BranchAdminError,
  createBranch,
  listBranches,
} from "@/lib/platform/branches-admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  try {
    const branches = await listBranches(prisma, actor, id);
    return NextResponse.json({
      branches: branches.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        status: b.status.code,
        timezone: b.timezone,
      })),
    });
  } catch (error) {
    if (error instanceof BranchAdminError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const { id } = await context.params;
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json();
  try {
    const created = await createBranch(prisma, actor, id, body);
    return NextResponse.json(
      { message: TH.common.saved, id: created.id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BranchAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "CODE_DUPLICATE"
            ? 409
            : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
