import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  assertPlatformInternalSecret,
  HomeBranchSyncError,
  syncPlatformHomeBranch,
} from "@/lib/platform/hr-home-branch-sync";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizationId: z.string().uuid(),
  platformUserId: z.string().uuid(),
  branchId: z.string().uuid(),
  actorAuthUserId: z.string().uuid().nullable().optional(),
});

/**
 * Service-to-service: HR calls this after transferring an employee's home branch
 * so Platform membership scope + lastBranchId stay in sync for login.
 */
export async function POST(request: NextRequest) {
  if (
    !assertPlatformInternalSecret(
      request.headers.get("x-gs-platform-internal-secret"),
    )
  ) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "VALIDATION", message: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION", message: "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const result = await syncPlatformHomeBranch(prisma, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HomeBranchSyncError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    console.error("[hr/home-branch] sync failed", error);
    return NextResponse.json(
      { code: "INTERNAL", message: "ซิงก์สาขาไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
