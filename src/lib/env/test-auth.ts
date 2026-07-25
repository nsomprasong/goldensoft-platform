/** Edge-safe helper — do not import Node fs modules here. */
export function isTestAuthEnabled(value?: string): boolean {
  const raw = (value ?? process.env.ALLOW_TEST_AUTH ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
