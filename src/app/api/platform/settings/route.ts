import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  getAuthFlexibilitySettings,
  setAuthFlexibilitySettings,
} from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

function assertSuperAdmin(platformRoles: string[]) {
  return platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
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
  if (!assertSuperAdmin(actor.platformRoles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
    );
  }
  const settings = await getAuthFlexibilitySettings(prisma);
  return NextResponse.json({ settings });
}

const patchSchema = z
  .object({
    invitationsSendEnabled: z.boolean().optional(),
    phoneLoginEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.invitationsSendEnabled === "boolean" ||
      typeof value.phoneLoginEnabled === "boolean",
    { message: TH.common.failed },
  );

export async function PATCH(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }
  const actor = await loadActorAccess(prisma, user.id);
  if (!assertSuperAdmin(actor.platformRoles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.common.forbidden },
      { status: 403 },
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "INVALID_BODY",
        message: parsed.error.issues[0]?.message ?? TH.common.failed,
      },
      { status: 400 },
    );
  }

  try {
    const settings = await setAuthFlexibilitySettings(prisma, {
      actorAuthUserId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("setAuthFlexibilitySettings failed", error);
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: TH.common.failed },
      { status: 500 },
    );
  }
}
