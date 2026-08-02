import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  applyDataReset,
  listDataResetTargets,
  previewDataReset,
  DATA_RESET_CONFIRM_PHRASE,
} from "@/lib/ops/data-reset";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";
import { PurgeSafetyError } from "@/lib/seed/purge-dataset";

export const dynamic = "force-dynamic";

async function requireSuperAdmin(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return {
      error: NextResponse.json(
        { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
        { status: 401 },
      ),
    };
  }
  const actor = await loadActorAccess(prisma, user.id);
  if (!actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return {
      error: NextResponse.json(
        { code: "FORBIDDEN", message: TH.common.forbidden },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if ("error" in auth && auth.error) return auth.error;
  const targets = await listDataResetTargets(prisma);
  return NextResponse.json({
    targets,
    confirmPhrase: DATA_RESET_CONFIRM_PHRASE,
  });
}

const bodySchema = z.object({
  action: z.enum(["preview", "apply"]),
  selectAll: z.boolean().default(false),
  organizationIds: z.array(z.string().uuid()).default([]),
  branchIds: z.array(z.string().uuid()).default([]),
  confirmPhrase: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if ("error" in auth || !auth.user) {
    return "error" in auth && auth.error
      ? auth.error
      : NextResponse.json(
          { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
          { status: 401 },
        );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ message: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const selection = {
    selectAll: parsed.data.selectAll,
    organizationIds: parsed.data.organizationIds,
    branchIds: parsed.data.branchIds,
  };

  try {
    if (parsed.data.action === "preview") {
      const preview = await previewDataReset(prisma, selection);
      return NextResponse.json({ preview });
    }
    const result = await applyDataReset(
      prisma,
      selection,
      parsed.data.confirmPhrase ?? "",
      { userId: auth.user.id, email: auth.user.email ?? null },
    );
    return NextResponse.json({
      ok: true,
      preview: result.preview,
      message: "ล้างข้อมูลเรียบร้อย",
    });
  } catch (error) {
    if (error instanceof PurgeSafetyError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("[data-reset]", error);
    return NextResponse.json(
      { message: "ล้างข้อมูลไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
