import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  OnboardingError,
  onboardOrganization,
} from "@/lib/platform/organization-onboarding";
import { MASTER } from "@/lib/platform/master-codes";
import { individualCustomerIdentitySchema } from "@/lib/platform/staff-identity";
import { prisma } from "@/lib/prisma";

const optionalTrimmed = z
  .string()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const optionalEmail = z
  .string()
  .max(200)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  })
  .pipe(z.union([z.string().email(), z.null()]));

const schema = z
  .object({
    idempotencyKey: z.string().min(8).max(120),
    organization: z.object({
      customerCode: z.string().trim().min(2).max(40).optional(),
      entityType: z.enum([
        MASTER.organizationEntityType.LEGAL_ENTITY,
        MASTER.organizationEntityType.INDIVIDUAL,
      ]),
      displayName: z.string().trim().max(120).optional().nullable(),
      legalName: optionalTrimmed,
      taxId: z
        .string()
        .max(40)
        .optional()
        .nullable()
        .transform((value) => {
          const trimmed = value?.trim();
          return trimmed ? trimmed : null;
        }),
      nameEn: optionalTrimmed,
      email: optionalEmail,
      phone: z
        .string()
        .max(40)
        .optional()
        .nullable()
        .transform((value) => {
          const trimmed = value?.trim();
          return trimmed ? trimmed : null;
        })
        .refine((value) => {
          if (!value) return true;
          const normalized = value.replace(/[\s()-]/g, "");
          const local = normalized.startsWith("+66")
            ? `0${normalized.slice(3)}`
            : normalized;
          return /^0\d{8,9}$/.test(local);
        }, "กรุณากรอกโทรศัพท์พื้นฐาน 9 หลัก หรือโทรศัพท์มือถือ 10 หลัก"),
      address: optionalTrimmed,
      person: individualCustomerIdentitySchema.optional().nullable(),
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
    selections: z
      .array(
        z.object({
          productCode: z.string().trim().min(2).max(40),
          planCode: z.string().trim().min(2).max(40),
        }),
      )
      .min(1),
    subscriptionMode: z.enum(["TRIAL", "ACTIVE"]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const [index, row] of data.selections.entries()) {
      if (seen.has(row.productCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `เลือกผลิตภัณฑ์ซ้ำ: ${row.productCode}`,
          path: ["selections", index, "productCode"],
        });
      }
      seen.add(row.productCode);
    }
    if (
      data.organization.entityType ===
      MASTER.organizationEntityType.LEGAL_ENTITY
    ) {
      const name = data.organization.displayName?.trim() ?? "";
      if (name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: TH.org.needDisplayName,
          path: ["organization", "displayName"],
        });
      }
      return;
    }
    // TEMP: individual tax-payer identity may be omitted for onboarding tests.
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
    const first =
      parsed.error.issues[0]?.message ?? TH.common.failed;
    return NextResponse.json(
      { code: "INVALID_BODY", message: first },
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
    console.error("onboardOrganization failed", error);
    return NextResponse.json(
      {
        code: "ONBOARDING_FAILED",
        message: "สร้างองค์กรไม่สำเร็จ กรุณาลองใหม่",
      },
      { status: 500 },
    );
  }
}
