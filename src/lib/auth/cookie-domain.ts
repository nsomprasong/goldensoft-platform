/**
 * Shared Auth / context cookie Domain for platform.* + app.* hosts.
 * Set AUTH_COOKIE_DOMAIN=.goldensoft.cloud in production only.
 * Leave unset on localhost / LAN ports (host-only cookies).
 */
export function authCookieDomain(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.AUTH_COOKIE_DOMAIN?.trim();
  if (!raw || !raw.startsWith(".") || raw.length < 3) return undefined;
  if (raw.includes("://") || raw.includes("/")) return undefined;
  return raw;
}

/** Merge Domain into cookie options when AUTH_COOKIE_DOMAIN is set. */
export function withAuthCookieDomain<T extends Record<string, unknown>>(
  options?: T,
  env: Record<string, string | undefined> = process.env,
): T & { domain?: string } {
  const domain = authCookieDomain(env);
  const base = { ...(options ?? {}) } as T & { domain?: string };
  if (domain) base.domain = domain;
  return base;
}
