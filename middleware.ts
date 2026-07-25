import { NextResponse, type NextRequest } from "next/server";

import { isAuthPage, isProtectedPath } from "@/lib/auth/access";
import { isTestAuthEnabled } from "@/lib/env/test-auth";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const inviteConfigurationError = productionInviteConfigurationError();
    if (inviteConfigurationError) {
      return NextResponse.json(
        {
          code: inviteConfigurationError,
          message: "การตั้งค่าระบบคำเชิญใน Production ไม่ปลอดภัย",
        },
        { status: 500 },
      );
    }
  }
  if (
    process.env.NODE_ENV === "production" &&
    isTestAuthEnabled(process.env.ALLOW_TEST_AUTH)
  ) {
    return NextResponse.json(
      {
        code: "TEST_AUTH_IN_PRODUCTION",
        message: "โหมดทดสอบการเข้าสู่ระบบถูกห้ามใน Production",
      },
      { status: 500 },
    );
  }

  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const testAuth =
    isTestAuthEnabled() &&
    Boolean(request.headers.get("x-test-auth-user-id"));
  const signedIn = Boolean(user) || testAuth;

  if (isAuthPage(pathname) && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (isProtectedPath(pathname) && !signedIn) {
    // Browser bootstrap should redirect to login (not JSON).
    if (
      pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/platform/context/bootstrap")
    ) {
      return NextResponse.json(
        {
          code: "UNAUTHENTICATED",
          message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
        },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (!pathname.startsWith("/api/")) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  return response;
}

function productionInviteConfigurationError(): string | null {
  if ((process.env.AUTH_INVITE_MODE ?? "real") !== "real") {
    return "AUTH_INVITE_MOCK_IN_PRODUCTION";
  }
  if (
    !process.env.SUPABASE_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return "AUTH_INVITE_CONFIGURATION_MISSING";
  }
  try {
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (appUrl.protocol !== "https:" || appUrl.search || appUrl.hash) {
      return "AUTH_INVITE_APP_URL_INVALID";
    }
  } catch {
    return "AUTH_INVITE_APP_URL_INVALID";
  }
  const redirectPath =
    process.env.SUPABASE_INVITE_REDIRECT_PATH ?? "/auth/accept-invite";
  if (
    !redirectPath.startsWith("/") ||
    redirectPath.startsWith("//") ||
    redirectPath.includes("\\")
  ) {
    return "AUTH_INVITE_REDIRECT_INVALID";
  }
  return null;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
