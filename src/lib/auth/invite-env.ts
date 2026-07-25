import { z } from "zod";

export type AuthInviteMode = "mock" | "real";

export type InviteEnvironment = {
  mode: AuthInviteMode;
  appUrl: URL;
  redirectTo: string;
  supabaseUrl: string;
  secretKey: string | null;
};

export class InviteEnvironmentError extends Error {
  constructor(
    readonly code:
      | "AUTH_INVITE_MODE_INVALID"
      | "AUTH_INVITE_MOCK_IN_PRODUCTION"
      | "AUTH_INVITE_APP_URL_INVALID"
      | "AUTH_INVITE_REDIRECT_INVALID"
      | "AUTH_INVITE_CONFIGURATION_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "InviteEnvironmentError";
  }
}

const modeSchema = z.enum(["mock", "real"]);

export function resolveInviteEnvironment(
  input: Record<string, string | undefined> = process.env,
): InviteEnvironment {
  const nodeEnv = input.NODE_ENV ?? "development";
  const parsedMode = modeSchema.safeParse(
    input.AUTH_INVITE_MODE ?? (nodeEnv === "production" ? "real" : "mock"),
  );
  if (!parsedMode.success) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_MODE_INVALID",
      "AUTH_INVITE_MODE ต้องเป็น mock หรือ real",
    );
  }
  if (nodeEnv === "production" && parsedMode.data === "mock") {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_MOCK_IN_PRODUCTION",
      "ห้ามใช้โหมดคำเชิญจำลองใน Production",
    );
  }

  let appUrl: URL;
  try {
    appUrl = new URL(input.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  } catch {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ไม่ถูกต้อง",
    );
  }
  if (
    appUrl.username ||
    appUrl.password ||
    appUrl.search ||
    appUrl.hash ||
    (nodeEnv === "production" && appUrl.protocol !== "https:")
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ต้องเป็น HTTPS origin ที่ปลอดภัยใน Production",
    );
  }

  const redirectPath =
    input.SUPABASE_INVITE_REDIRECT_PATH ?? "/auth/accept-invite";
  if (
    !redirectPath.startsWith("/") ||
    redirectPath.startsWith("//") ||
    redirectPath.includes("\\")
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_REDIRECT_INVALID",
      "เส้นทางรับคำเชิญไม่ถูกต้อง",
    );
  }
  const redirectUrl = new URL(redirectPath, appUrl);
  if (redirectUrl.origin !== appUrl.origin) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_REDIRECT_INVALID",
      "ปลายทางคำเชิญต้องอยู่ภายใต้โดเมนของแอป",
    );
  }

  const supabaseUrl = input.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const secretKey = input.SUPABASE_SECRET_KEY?.trim() || null;
  if (parsedMode.data === "real" && (!supabaseUrl || !secretKey)) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_CONFIGURATION_MISSING",
      "การตั้งค่า Supabase Auth Admin ไม่ครบถ้วน",
    );
  }

  return {
    mode: parsedMode.data,
    appUrl,
    redirectTo: redirectUrl.toString(),
    supabaseUrl,
    secretKey,
  };
}
