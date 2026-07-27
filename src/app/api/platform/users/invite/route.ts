import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthInviteError,
  createAuthInviteAdapter,
} from "@/lib/auth/auth-invite-adapter";
import {
  InviteEnvironmentError,
  resolveInviteEnvironment,
} from "@/lib/auth/invite-env";
import { loadActorAccess } from "@/lib/auth/actor-access";
import {
  getIdempotencyKey,
  isSameOriginMutation,
} from "@/lib/auth/mutation-security";
import {
  evaluateRealInviteSend,
  maskInviteEmail,
  resolveRealInviteGate,
} from "@/lib/auth/real-invite-gate";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  UserInvitationError,
  inviteOrganizationUserReal,
  provisionOrganizationUserDirect,
  realInviteUserSchema,
} from "@/lib/platform/user-invitations";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { toE164ThaiMobile } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const headerKey = getIdempotencyKey(request);
    if (!headerKey || (body.idempotencyKey && body.idempotencyKey !== headerKey)) {
      return NextResponse.json(
        { message: "รหัสป้องกันคำขอซ้ำไม่ถูกต้อง", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 400 },
      );
    }
    const actor = await loadActorAccess(prisma, user.id);
    const parsed = realInviteUserSchema.parse({
      ...body,
      idempotencyKey: headerKey,
    });
    const phoneE164 = parsed.phone ? toE164ThaiMobile(parsed.phone) : null;
    const sendEnabled = await isInvitationSendEnabled(prisma);
    // Direct provision (set password immediately) when:
    // - invite send is disabled, or
    // - no email (phone-only account)
    const useDirectProvision = !sendEnabled || !parsed.email;

    if (useDirectProvision) {
      const result = await provisionOrganizationUserDirect(
        prisma,
        actor,
        parsed,
      );
      return NextResponse.json(
        {
          message: TH.users.provisionSuccess,
          ...result,
        },
        { status: result.reused ? 200 : 201 },
      );
    }

    const environment = resolveInviteEnvironment();
    const gateDecision = evaluateRealInviteSend({
      mode: environment.mode,
      email: parsed.email!,
      gate: resolveRealInviteGate(),
    });
    if (gateDecision.action === "preview") {
      return NextResponse.json(
        {
          preview: true,
          writeOperations: "NONE",
          code: gateDecision.code,
          message: gateDecision.message,
          emailMasked: maskInviteEmail(gateDecision.email),
          redirectTo: environment.redirectTo,
          mode: environment.mode,
        },
        { status: 200 },
      );
    }
    if (gateDecision.action === "reject") {
      return NextResponse.json(
        {
          message: gateDecision.message,
          code: gateDecision.code,
          emailMasked: maskInviteEmail(gateDecision.email),
        },
        { status: 403 },
      );
    }

    const auth = createAuthInviteAdapter(environment);
    const result = await inviteOrganizationUserReal(
      prisma,
      actor,
      { ...parsed, phone: phoneE164 },
      auth,
      environment.redirectTo,
    );
    return NextResponse.json(
      {
        message:
          environment.mode === "mock"
            ? TH.users.inviteMockSuccess
            : TH.users.inviteSuccess,
        inviteMode: environment.mode,
        ...result,
      },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof UserInvitationError) {
      const status =
        error.code === "FORBIDDEN" || error.code === "ROLE_FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "EMAIL_CONFLICT" ||
                error.code === "ALREADY_ACTIVE" ||
                error.code === "IDEMPOTENCY_CONFLICT"
              ? 409
              : error.code === "RATE_LIMITED"
                ? 429
              : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    if (
      error instanceof AuthInviteError ||
      error instanceof InviteEnvironmentError
    ) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error instanceof AuthInviteError && error.code === "AUTH_INVITE_RATE_LIMITED" ? 429 : 502 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? TH.common.failed },
        { status: 400 },
      );
    }
    console.error("invite user failed", error);
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }
}
