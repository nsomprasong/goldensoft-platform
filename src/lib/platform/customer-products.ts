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
  },
  {
    productCode: "GOLDENSOFT_HR",
    labelTh: "บุคลากร",
    basePath: "/hr",
    entitlementCode: "hr.access",
  },
  {
    productCode: "QRSTATION",
    labelTh: "QR Station",
    basePath: "/qrstation",
    entitlementCode: "qrstation.access",
  },
] as const;

export type CustomerProductCard = (typeof CUSTOMER_PRODUCT_CARDS)[number];

/** Prefer a dedicated URL; otherwise first allowlisted CUSTOMER_APP_ORIGINS entry. */
export function getPreferredCustomerAppOrigin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.CUSTOMER_APP_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
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
      return new URL(candidate).origin;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Pick the product home path from active entitlements.
 * One product → deep-link into it; several → customer dashboard `/`.
 */
export function pickCustomerProductHomePath(
  entitlementCodes: string[],
): string {
  const allowed = CUSTOMER_PRODUCT_CARDS.filter((card) =>
    entitlementCodes.includes(card.entitlementCode),
  );
  if (allowed.length === 1) {
    return allowed[0]!.basePath;
  }
  return "/";
}
