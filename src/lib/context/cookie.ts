import { createHmac, timingSafeEqual } from "crypto";

export type PlatformContextCookie = {
  organizationId: string;
  branchId: string | null;
  /** SUPER_ADMIN managing an org without membership. */
  mode?: "membership" | "platform_admin";
};

const COOKIE_NAME = "gs_platform_ctx";

function getSecret(): string {
  const secret = process.env.PLATFORM_CONTEXT_COOKIE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("PLATFORM_CONTEXT_COOKIE_SECRET is required");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeContextCookie(value: PlatformContextCookie): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function decodeContextCookie(
  raw: string | undefined | null,
): PlatformContextCookie | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as PlatformContextCookie;
    if (typeof parsed.organizationId !== "string") return null;
    return {
      organizationId: parsed.organizationId,
      branchId:
        typeof parsed.branchId === "string" || parsed.branchId === null
          ? parsed.branchId
          : null,
      mode:
        parsed.mode === "platform_admin" || parsed.mode === "membership"
          ? parsed.mode
          : undefined,
    };
  } catch {
    return null;
  }
}

export function contextCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export { COOKIE_NAME };
