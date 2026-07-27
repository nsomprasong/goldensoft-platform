import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived, signed pointer to an open password-reset row. It carries no
 * privileges beyond reaching /auth/set-password for that one reset.
 */
export type PasswordResetCookie = {
  resetId: string;
  /** Epoch milliseconds; mirrors user_password_resets.expires_at. */
  expiresAt: number;
};

const COOKIE_NAME = "gs_pw_reset";

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

export function encodePasswordResetCookie(value: PasswordResetCookie): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function decodePasswordResetCookie(
  raw: string | undefined | null,
  now: number = Date.now(),
): PasswordResetCookie | null {
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
    const parsed = JSON.parse(json) as PasswordResetCookie;
    if (typeof parsed.resetId !== "string" || !parsed.resetId) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) {
      return null;
    }
    return { resetId: parsed.resetId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function passwordResetCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(maxAgeSeconds, 0),
  };
}

export { COOKIE_NAME as PASSWORD_RESET_COOKIE_NAME };
