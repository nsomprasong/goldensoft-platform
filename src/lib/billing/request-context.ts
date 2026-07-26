import type { NextRequest } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { COOKIE_NAME, decodeContextCookie } from "@/lib/context/cookie";
import { BillingError } from "@/lib/billing/codes";
import { permissionsForRoles } from "@/lib/permissions/codes";

export async function customerBillingContext(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) throw new BillingError("UNAUTHENTICATED", "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", 401);
  const bundle = await loadPlatformUserBundle(user.id);
  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);
  const organizationId = cookie?.organizationId ?? (bundle.memberships.length === 1 ? bundle.memberships[0]?.organizationId : null);
  const membership = bundle.memberships.find((row) => row.organizationId === organizationId);
  const isSuper = bundle.platformRoles.includes("SUPER_ADMIN");
  if (!organizationId || (!membership && !(isSuper && cookie?.mode === "platform_admin"))) throw new BillingError("ORG_FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงองค์กรนี้", 403);
  return { user, organizationId, permissions: permissionsForRoles({ platformRoles: bundle.platformRoles, organizationRoles: membership?.roles ?? [] }) };
}
