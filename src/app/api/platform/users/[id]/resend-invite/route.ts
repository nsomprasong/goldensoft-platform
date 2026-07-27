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
import { TH } from "@/lib/i18n/th";
import {
  UserInvitationError,
  resendOrganizationInvitation,
} from "@/lib/platform/user-invitations";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
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
    const { id } = await params;
    const actor = await loadActorAccess(prisma, user.id);
    const environment = resolveInviteEnvironment();

    // Peek invitation email for the first-real-invite gate before any Auth send.
    const invitation = await prisma.userInvitation.findUnique({
      where: { id },
      select: { emailNormalized: true },
    });
    if (!invitation) {
      return NextResponse.json(
        { message: TH.common.notFound, code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const gateDecision = evaluateRealInviteSend({
      mode: environment.mode,
      email: invitation.emailNormalized,
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
    const result = await resendOrganizationInvitation(
      prisma,
      actor,
      id,
      auth,
      environment.redirectTo,
    );
    return NextResponse.json({ message: TH.users.inviteSuccess, ...result });
  } catch (error) {
    if (error instanceof UserInvitationError) {
      const status =
        error.code === "FORBIDDEN" || error.code === "ROLE_FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "RATE_LIMITED"
              ? 429
              : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
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
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }
}
