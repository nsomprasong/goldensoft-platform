import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  COOKIE_NAME,
  decodeContextCookie,
} from "@/lib/context/cookie";
import { TH } from "@/lib/i18n/th";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
  }),
  profile: z
    .object({
      displayName: z.string(),
      email: z.string(),
      phone: z.string().nullable().optional(),
      statusCode: z.string(),
    })
    .nullable(),
  platformRoles: z.array(z.string()),
  memberships: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      organizationStatus: z.string(),
      roles: z.array(z.string()),
      branchCount: z.number().int().nonnegative(),
      branches: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            code: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  activeOrganization: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  activeBranch: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
  permissions: z.array(z.string()),
});

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  const bundle = await loadPlatformUserBundle(user.id);
  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);

  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;

  const activeBranch =
    activeMembership && cookie?.branchId
      ? (activeMembership.branches.find((b) => b.id === cookie.branchId) ??
        null)
      : null;

  const organizationRoles = activeMembership?.roles ?? [];
  const permissions = bundle.platformRoles.includes("SUPER_ADMIN")
    ? (
        await prisma.permission.findMany({
          where: { isActive: true },
          select: { code: true },
          orderBy: { code: "asc" },
        })
      ).map((permission) => permission.code)
    : permissionsForRoles({
        platformRoles: bundle.platformRoles,
        organizationRoles,
      });

  const payload = meResponseSchema.parse({
    user: { id: user.id, email: user.email },
    profile: bundle.profile
      ? {
          displayName: bundle.profile.displayName,
          email: bundle.profile.email,
          phone: bundle.profile.phone ?? null,
          statusCode: bundle.profile.statusCode,
        }
      : null,
    platformRoles: bundle.platformRoles,
    memberships: bundle.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      roles: m.roles,
      branchCount: m.branches.length,
      branches: m.branches,
    })),
    activeOrganization: activeMembership
      ? {
          id: activeMembership.organizationId,
          name: activeMembership.organizationName,
        }
      : null,
    activeBranch: activeBranch
      ? {
          id: activeBranch.id,
          name: activeBranch.name,
          code: activeBranch.code,
        }
      : null,
    permissions,
  });

  return NextResponse.json(payload);
}
