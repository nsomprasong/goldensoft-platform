export type SeedMode = "system" | "development-demo" | "production-bootstrap";

export function resolveSeedMode(
  raw: string | undefined = process.env.SEED_MODE,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SeedMode {
  const mode = (raw ?? "system").trim().toLowerCase();
  if (
    mode !== "system" &&
    mode !== "development-demo" &&
    mode !== "production-bootstrap"
  ) {
    throw new Error(
      `Invalid SEED_MODE="${raw}". Use system | development-demo | production-bootstrap`,
    );
  }
  if (mode === "development-demo" && nodeEnv === "production") {
    throw new Error(
      "SEED_MODE=development-demo is forbidden in production",
    );
  }
  return mode;
}
