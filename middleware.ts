import { NextResponse, type NextRequest } from "next/server";

import { isAuthPage, isProtectedPath } from "@/lib/auth/access";
import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import {
  MIDDLEWARE_AUTH_EMAIL_HEADER,
  MIDDLEWARE_AUTH_USER_HEADER,
} from "@/lib/auth/middleware-headers";
import { isTestAuthEnabled } from "@/lib/env/test-auth";
import { updateSession } from "@/lib/supabase/middleware";

function copySessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

/** Honor relative `?next=` when an already-signed-in user hits /login. */
function signedInLoginRedirect(
  request: NextRequest,
  sessionResponse: NextResponse,
): NextResponse {
  const rawNext = request.nextUrl.searchParams.get("next");
  const resolved = resolvePostLoginRedirect(rawNext);

  if (resolved.startsWith("/") && !resolved.startsWith("//")) {
    return copySessionCookies(
      sessionResponse,
      NextResponse.redirect(new URL(resolved, request.url)),
    );
  }

  const home = request.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  return copySessionCookies(sessionResponse, NextResponse.redirect(home));
}

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

  const { pathname } = request.nextUrl;

  // Cookie wipe must not refresh/re-write the session first.
  if (pathname.startsWith("/auth/reset-cookies")) {
    return NextResponse.next();
  }

  const { response: sessionResponse, user } = await updateSession(request);

  const requestHeaders = new Headers(request.headers);
  // Never trust client-supplied identity headers — only middleware may set them.
  requestHeaders.delete(MIDDLEWARE_AUTH_USER_HEADER);
  requestHeaders.delete(MIDDLEWARE_AUTH_EMAIL_HEADER);
  requestHeaders.set("x-gs-pathname", pathname);
  if (user) {
    requestHeaders.set(MIDDLEWARE_AUTH_USER_HEADER, user.id);
    if (user.email) {
      requestHeaders.set(MIDDLEWARE_AUTH_EMAIL_HEADER, user.email);
    }
  }
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  const testAuth =
    isTestAuthEnabled() &&
    Boolean(request.headers.get("x-test-auth-user-id"));
  const signedIn = Boolean(user) || testAuth;

  if (isAuthPage(pathname) && signedIn) {
    const rawNext = request.nextUrl.searchParams.get("next");
    const resolved = resolvePostLoginRedirect(rawNext);
    // Absolute Customer App URLs need a staff vs tenant role check — login page.
    if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
      return response;
    }
    return signedInLoginRedirect(request, sessionResponse);
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
  // Session refresh only runs for real navigations/API calls; static assets and
  // build output never pay for a Supabase round trip.
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
