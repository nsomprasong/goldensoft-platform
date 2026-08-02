/**
 * Product cards shown to customer users (Customer App bootstrap + post-login).
 * Keep in sync with goldensoft-app product registry paths.
 */
export const CUSTOMER_PRODUCT_CARDS = [
  {
    productCode: "RESIDENT_V2",
    labelTh: "ระบบรีสอร์ท",
    basePath: "/resident",
    entitlementCode: "resident_v2.access",
    /** Keep in sync with goldensoft-app product registry runtimeStatus. */
    runtimeStatus: "coming_soon" as const,
  },
  {
    productCode: "GOLDENSOFT_HR",
    labelTh: "บุคลากร",
    basePath: "/hr",
    entitlementCode: "hr.access",
    runtimeStatus: "available" as const,
  },
  {
    productCode: "QRSTATION",
    labelTh: "QR Station",
    basePath: "/qrstation",
    entitlementCode: "qrstation.access",
    runtimeStatus: "coming_soon" as const,
  },
] as const;

export type CustomerProductCard = (typeof CUSTOMER_PRODUCT_CARDS)[number];

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * When login is opened via LAN IP (phone → http://192.168.x.x:3000), rewrite
 * a loopback Customer App origin onto that host so redirect is not stuck on
 * localhost. Keeps the Customer App port from the configured origin (usually 3002).
 *
 * Never rewrite a real public host (app.x) onto platform.x — that sends org
 * users to platform `/auth/callback`, which does not exist (404 → RSC 502).
 */
export function alignCustomerAppOriginToRequestHost(
  customerOrigin: string,
  requestHostHeader: string | null | undefined,
): string {
  if (!requestHostHeader?.trim()) return customerOrigin;
  const requestHostname = requestHostHeader.split(":")[0]?.trim().toLowerCase();
  if (!requestHostname) return customerOrigin;
  try {
    const url = new URL(customerOrigin);
    if (url.hostname.toLowerCase() === requestHostname) return customerOrigin;
    // Only rewrite loopback configs onto the phone/LAN request host.
    if (!isLoopbackHostname(url.hostname)) {
      return customerOrigin;
    }
    if (isLoopbackHostname(requestHostname)) {
      return customerOrigin;
    }
    url.hostname = requestHostname;
    return url.origin;
  } catch {
    return customerOrigin;
  }
}

/** Prefer a dedicated URL; otherwise first allowlisted CUSTOMER_APP_ORIGINS entry. */
export function getPreferredCustomerAppOrigin(
  env: Record<string, string | undefined> = process.env,
  requestHostHeader?: string | null,
): string | null {
  const explicit = env.CUSTOMER_APP_URL?.trim();
  if (explicit) {
    try {
      return alignCustomerAppOriginToRequestHost(
        new URL(explicit).origin,
        requestHostHeader,
      );
    } catch {
      // fall through
    }
  }
  const fromList = (env.CUSTOMER_APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ["http://127.0.0.1:3002", "http://localhost:3002"];
  for (const candidate of [...fromList, ...defaults]) {
    try {
      return alignCustomerAppOriginToRequestHost(
        new URL(candidate).origin,
        requestHostHeader,
      );
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Pick the product home path from active entitlements.
 * One *available* product → deep-link into it; several → customer dashboard `/`.
 * Coming-soon entitlements do not count (avoids landing on the launcher when
 * HR is the only usable product).
 */
export function pickCustomerProductHomePath(
  entitlementCodes: string[],
): string {
  const allowed = CUSTOMER_PRODUCT_CARDS.filter(
    (card) =>
      card.runtimeStatus === "available" &&
      entitlementCodes.includes(card.entitlementCode),
  );
  if (allowed.length === 1) {
    return allowed[0]!.basePath;
  }
  return "/";
}
