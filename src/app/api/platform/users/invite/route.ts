import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
import {
  InviteError,
  createMockAuthInviteAdapter,
  inviteOrganizationUser,
} from "@/lib/platform/users-invite";
import { prisma } from "@/lib/prisma";

/**
 * Phase 5 invite endpoint uses the mock Auth adapter only.
 * Real Supabase Auth Admin invite requires explicit approval before enabling.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const body = await request.json();
  try {
    const result = await inviteOrganizationUser(
      prisma,
      actor,
      body,
      createMockAuthInviteAdapter(),
    );
    return NextResponse.json(
      {
        message: TH.users.inviteSuccess,
        ...result,
        // Never expose auth secrets; ids are ok for admin UI.
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InviteError) {
      const status =
        error.code === "FORBIDDEN" || error.code === "ROLE_FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "ALREADY_MEMBER" ||
                error.code === "EMAIL_CONFLICT" ||
                error.code === "PENDING_INVITE"
              ? 409
              : 400;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: TH.common.failed }, { status: 400 });
  }
}
