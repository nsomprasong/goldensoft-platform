import { BillingError } from "@/lib/billing/codes";

/** Enforces a billing capability without coupling services to HTTP. */
export function requireBillingPermission(
  permissions: readonly string[],
  code: string,
): void {
  if (!permissions.includes(code)) {
    throw new BillingError("FORBIDDEN", "คุณไม่มีสิทธิ์ดำเนินการนี้", 403);
  }
}
