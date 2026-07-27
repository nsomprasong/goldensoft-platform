import { NextRequest, NextResponse } from "next/server";

import {
  AuthInviteError,
  createAuthInviteAdapter,
} from "@/lib/auth/auth-invite-adapter";
import { loadActorAccess } from "@/lib/auth/actor-access";
import {
  InviteEnvironmentError,
  resolveInviteEnvironment,
} from "@/lib/auth/invite-env";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import {
  evaluateRealInviteSend,
  maskInviteEmail,
  resolveRealInviteGate,
} from "@/lib/auth/real-invite-gate";
import { requireAuthUser } from "@/lib/auth/request-auth";
import {
  createStaffAuthAdapter,
  StaffAuthError,
} from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { sendStaffInvite, StaffAdminError } from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  try {
    if (!(await isInvitationSendEnabled(prisma))) {
      return NextResponse.json(
        {
          message: TH.settings.invitationsDisabled,
          code: "INVITATIONS_DISABLED",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const actorAccess = await loadActorAccess(prisma, user.id);
    const actor = {
      authUserId: user.id,
      platformRoles: actorAccess.platformRoles,
    };

    const profile = await prisma.userProfile.findFirst({
      where: { id, deletedAt: null },
      select: { email: true },
    });
    if (!profile) {
      return NextResponse.json(
        { message: TH.common.notFound, code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const environment = resolveInviteEnvironment();
    const gateDecision = evaluateRealInviteSend({
      mode: environment.mode,
      email: profile.email,
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

    // Recovery/invite tokens land on set-password (session bootstrap + form).
    const redirectTo = new URL("/auth/set-password", environment.appUrl).toString();
    const result = await sendStaffInvite(prisma, {
      actor,
      auth: createStaffAuthAdapter(),
      inviteAuth: createAuthInviteAdapter(environment),
      userProfileId: id,
      redirectTo,
    });

    return NextResponse.json({
      ok: true,
      message:
        environment.mode === "mock"
          ? TH.staff.inviteMockSuccess
          : TH.staff.inviteSuccess,
      inviteMode: environment.mode,
      ...result,
      emailMasked: maskInviteEmail(result.email),
    });
  } catch (error) {
    if (error instanceof StaffAdminError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : 400;
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status },
      );
    }
    if (
      error instanceof AuthInviteError ||
      error instanceof InviteEnvironmentError
    ) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        {
          status:
            error instanceof AuthInviteError &&
            error.code === "AUTH_INVITE_RATE_LIMITED"
              ? 429
              : 502,
        },
      );
    }
    if (error instanceof StaffAuthError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: 502 },
      );
    }
    console.error("staff invite failed", error);
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }
}
