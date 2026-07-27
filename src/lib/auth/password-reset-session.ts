import { cookies } from "next/headers";

import {
  decodePasswordResetCookie,
  encodePasswordResetCookie,
  PASSWORD_RESET_COOKIE_NAME,
  passwordResetCookieOptions,
  type PasswordResetCookie,
} from "@/lib/auth/password-reset-cookie";
import {
  findOpenPasswordResetByEmail,
  getOpenPasswordResetById,
  type OpenPasswordReset,
} from "@/lib/platform/staff";
import { prisma } from "@/lib/prisma";

/**
 * Called when someone signs in with an empty password: if an operator opened a
 * reset window for that email, hand out the signed pointer to it. Returns null
 * otherwise so the caller can answer with the generic credential error.
 */
export async function startPasswordResetSession(
  email: string,
): Promise<OpenPasswordReset | null> {
  const reset = await findOpenPasswordResetByEmail(prisma, email);
  if (!reset) return null;
  return writePasswordResetSessionCookie(reset);
}

/** Open set-password for a known reset row (operator just provisioned a user). */
export async function beginPasswordResetSessionById(
  resetId: string,
): Promise<OpenPasswordReset | null> {
  const reset = await getOpenPasswordResetById(prisma, resetId);
  if (!reset) return null;
  return writePasswordResetSessionCookie(reset);
}

async function writePasswordResetSessionCookie(
  reset: OpenPasswordReset,
): Promise<OpenPasswordReset | null> {
  const maxAgeSeconds = Math.floor((reset.expiresAt.getTime() - Date.now()) / 1000);
  if (maxAgeSeconds <= 0) return null;

  const jar = await cookies();
  jar.set(
    PASSWORD_RESET_COOKIE_NAME,
    encodePasswordResetCookie({
      resetId: reset.id,
      expiresAt: reset.expiresAt.getTime(),
    }),
    passwordResetCookieOptions(maxAgeSeconds),
  );
  return reset;
}

export async function readPasswordResetSession(): Promise<PasswordResetCookie | null> {
  const jar = await cookies();
  return decodePasswordResetCookie(
    jar.get(PASSWORD_RESET_COOKIE_NAME)?.value,
  );
}

/** Resolve the cookie against the database — the row is the source of truth. */
export async function loadPasswordResetFromSession(): Promise<OpenPasswordReset | null> {
  const session = await readPasswordResetSession();
  if (!session) return null;
  return getOpenPasswordResetById(prisma, session.resetId);
}

export async function clearPasswordResetSession(): Promise<void> {
  const jar = await cookies();
  jar.set(PASSWORD_RESET_COOKIE_NAME, "", passwordResetCookieOptions(0));
}
