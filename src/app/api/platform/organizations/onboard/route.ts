import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  OnboardingError,
  onboardOrganization,
} from "@/lib/platform/organization-onboarding";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  idempotencyKey: z.string().min(8).max(120),
  organization: z.object({
    customerCode: z.string().min(2).max(40),
    slug: z.string().min(2).max(60),
    displayName: z.string().min(2).max(120),
    legalName: z.string().min(2).max(160),
    taxId: z.string().max(40).optional().nullable(),
    nameEn: z.string().max(120).optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
  }),
  primaryBranch: z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(120),
    nameEn: z.string().max(120).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
  }),
  owner: z.object({
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    authUserId: z.string().uuid().optional().nullable(),
  }),
  productCode: z.string().min(2).max(40),
  planCode: z.string().min(2).max(40),
  subscriptionMode: z.enum(["TRIAL", "ACTIVE"]),
});

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const actor = await loadActorAccess(prisma, user.id);
  try {
    const result = await onboardOrganization(prisma, {
      actor,
      actorAuthUserId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      payload: parsed.data,
    });
    return NextResponse.json({ ok: true, onboarding: result }, { status: 201 });
  } catch (error) {
    if (error instanceof OnboardingError) {
      const status = error.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    throw error;
  }
}
