import { NextRequest } from "next/server";

import {
  getAuthUser,
  readTestAuthFromHeaders,
} from "@/lib/auth/session";
import {
  COOKIE_NAME,
  decodeContextCookie,
} from "@/lib/context/cookie";
import {
  ContextError,
  resolveApplicationContext,
} from "@/lib/context/resolve-application-context";
import type { ApplicationContext } from "@/lib/context/types";
import { prisma } from "@/lib/prisma";

export async function requireAuthUser(request: NextRequest) {
  const test = readTestAuthFromHeaders(request.headers);
  const user = await getAuthUser(test);
  if (!user) {
    return null;
  }
  return user;
}

export async function requireApplicationContext(
  request: NextRequest,
  productCode: string,
): Promise<
  | { ok: true; ctx: ApplicationContext; authUserId: string }
  | { ok: false; status: number; message: string; code: string }
> {
  const user = await requireAuthUser(request);
  if (!user) {
    return {
      ok: false,
      status: 401,
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
      code: "UNAUTHENTICATED",
    };
  }

  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);
  const clientOrg = request.headers.get("x-organization-id");

  try {
    const ctx = await resolveApplicationContext(prisma, {
      authUserId: user.id,
      claimedOrganizationId: cookie?.organizationId ?? null,
      claimedBranchId: cookie ? cookie.branchId : undefined,
      clientOrganizationId: clientOrg,
      productCode,
    });
    return { ok: true, ctx, authUserId: user.id };
  } catch (error) {
    if (error instanceof ContextError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "CLIENT_ORG_MISMATCH" ||
              error.code === "ORG_FORBIDDEN" ||
              error.code === "BRANCH_FORBIDDEN" ||
              error.code === "PRODUCT_FORBIDDEN" ||
              error.code === "SUBSCRIPTION_MISSING"
            ? 403
            : 403;
      return {
        ok: false,
        status,
        message: error.message,
        code: error.code,
      };
    }
    throw error;
  }
}

export function hasPermission(
  ctx: ApplicationContext,
  permission: string,
): boolean {
  return (
    ctx.platformRoles.includes("SUPER_ADMIN") ||
    ctx.permissions.includes(permission)
  );
}
