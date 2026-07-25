import { NextRequest, NextResponse } from "next/server";

import {
  AuthInviteError,
  createAuthInviteAdapter,
} from "@/lib/auth/auth-invite-adapter";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { resolveInviteEnvironment } from "@/lib/auth/invite-env";
import { isSameOriginMutation } from "@/lib/auth/mutation-security";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  UserInvitationError,
  resendOrganizationInvitation,
} from "@/lib/platform/user-invitations";
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
    const { id } = await params;
    const actor = await loadActorAccess(prisma, user.id);
    const environment = resolveInviteEnvironment();
    const auth = createAuthInviteAdapter(environment, {
      expectedProjectRef: process.env.EXPECTED_SUPABASE_PROJECT_REF,
    });
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
    if (error instanceof AuthInviteError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === "AUTH_INVITE_RATE_LIMITED" ? 429 : 502 },
      );
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 500 });
  }
}
