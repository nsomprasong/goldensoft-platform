/**
 * Safe post-login redirects for Central Login.
 * Relative paths always allowed; absolute URLs must match CUSTOMER_APP_ORIGINS.
 */
export function resolvePostLoginRedirect(raw: string | null | undefined): string {
  const fallback = "/";
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    const allow = (process.env.CUSTOMER_APP_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const defaults = [
      "http://127.0.0.1:3002",
      "http://localhost:3002",
    ];
    const allowed = new Set([...defaults, ...allow]);
    if (allowed.has(url.origin)) {
      return url.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}
