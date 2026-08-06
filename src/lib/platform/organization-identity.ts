export const GOLDENSOFT_CUSTOMER_CODE = "GOLDENSOFT";

/** Stable platform-organization identity shared by server and client context flows. */
export function isGoldenSoftCustomerCode(
  customerCode: string | null | undefined,
): boolean {
  return (customerCode ?? "").trim().toUpperCase() === GOLDENSOFT_CUSTOMER_CODE;
}
