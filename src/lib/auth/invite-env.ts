import { z } from "zod";

export type AuthInviteMode = "mock" | "real";

export const DEFAULT_EXPECTED_SUPABASE_PROJECT_REF = "horyhrnqbeaivdztekfv";
export const DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF = "invnwpyshxdadhocueeh";
export const DEFAULT_INVITE_REDIRECT_PATH = "/auth/accept-invite";
export const REAL_INVITE_CONFIRM_VALUE = "SEND_ONE_REAL_INVITE";

export type InviteEnvironment = {
  mode: AuthInviteMode;
  appUrl: URL;
  redirectPath: string;
  redirectTo: string;
  supabaseUrl: string;
  secretKey: string | null;
  expectedProjectRef: string;
  blockedLegacyProjectRef: string;
};

export class InviteEnvironmentError extends Error {
  constructor(
    readonly code:
      | "AUTH_INVITE_MODE_INVALID"
      | "AUTH_INVITE_MOCK_IN_PRODUCTION"
      | "AUTH_INVITE_APP_URL_INVALID"
      | "AUTH_INVITE_REDIRECT_INVALID"
      | "AUTH_INVITE_CONFIGURATION_MISSING"
      | "AUTH_INVITE_PROJECT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "InviteEnvironmentError";
  }
}

const modeSchema = z.enum(["mock", "real"]);

/** Local / LAN hosts allowed for HTTP app URLs outside production. */
export function isAllowedDevHttpHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function normalizeAppUrl(
  raw: string,
  nodeEnv: string,
): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ไม่ถูกต้อง",
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ต้องเป็น origin อย่างเดียว ไม่มี path, query หรือ hash",
    );
  }

  if (nodeEnv === "production" && parsed.protocol !== "https:") {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ต้องเป็น HTTPS ใน Production",
    );
  }

  if (
    nodeEnv !== "production" &&
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      isAllowedDevHttpHostname(parsed.hostname)
    )
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL ใน development อนุญาต HTTPS, localhost หรือ IP ในเครือข่ายภายใน (เช่น 192.168.x.x)",
    );
  }

  // origin never includes a trailing slash
  return new URL(parsed.origin);
}

function assertRedirectPath(redirectPath: string): string {
  if (
    !redirectPath.startsWith("/") ||
    redirectPath.startsWith("//") ||
    redirectPath.includes("\\") ||
    redirectPath.includes("?") ||
    redirectPath.includes("#") ||
    /^(javascript|data):/i.test(redirectPath)
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_REDIRECT_INVALID",
      "เส้นทางรับคำเชิญไม่ถูกต้อง",
    );
  }
  return redirectPath;
}

function assertSupabaseProject(
  supabaseUrl: string,
  expectedProjectRef: string,
  blockedLegacyProjectRef: string,
): void {
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_PROJECT_MISMATCH",
      "โครงการ Supabase ไม่ตรงกับระบบที่กำหนด",
    );
  }

  const blockedHost = `${blockedLegacyProjectRef.toLowerCase()}.supabase.co`;
  const expectedHost = `${expectedProjectRef.toLowerCase()}.supabase.co`;
  if (host === blockedHost || host.includes(blockedLegacyProjectRef.toLowerCase())) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_PROJECT_MISMATCH",
      "ห้ามใช้โครงการ Supabase แบบ Legacy",
    );
  }
  if (host !== expectedHost) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_PROJECT_MISMATCH",
      "โครงการ Supabase ไม่ตรงกับระบบที่กำหนด",
    );
  }
}

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

  const appUrl = normalizeAppUrl(
    input.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002",
    nodeEnv,
  );

  const redirectPath = assertRedirectPath(
    input.SUPABASE_INVITE_REDIRECT_PATH ?? DEFAULT_INVITE_REDIRECT_PATH,
  );
  const redirectUrl = new URL(redirectPath, appUrl);
  if (
    redirectUrl.origin !== appUrl.origin ||
    redirectUrl.pathname !== redirectPath ||
    redirectUrl.search ||
    redirectUrl.hash ||
    redirectUrl.username ||
    redirectUrl.password
  ) {
    throw new InviteEnvironmentError(
      "AUTH_INVITE_REDIRECT_INVALID",
      "ปลายทางคำเชิญต้องอยู่ภายใต้โดเมนของแอปและตรงกับเส้นทางที่กำหนด",
    );
  }

  const expectedProjectRef = (
    input.EXPECTED_SUPABASE_PROJECT_REF ?? DEFAULT_EXPECTED_SUPABASE_PROJECT_REF
  ).trim();
  const blockedLegacyProjectRef = (
    input.BLOCKED_LEGACY_SUPABASE_PROJECT_REF ??
    DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF
  ).trim();

  const supabaseUrl = input.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const secretKey = input.SUPABASE_SECRET_KEY?.trim() || null;
  if (parsedMode.data === "real") {
    if (!supabaseUrl || !secretKey) {
      throw new InviteEnvironmentError(
        "AUTH_INVITE_CONFIGURATION_MISSING",
        "การตั้งค่า Supabase Auth Admin ไม่ครบถ้วน",
      );
    }
    assertSupabaseProject(
      supabaseUrl,
      expectedProjectRef,
      blockedLegacyProjectRef,
    );
  } else if (supabaseUrl) {
    // Still block legacy even in mock when a URL is present.
    try {
      assertSupabaseProject(
        supabaseUrl,
        expectedProjectRef,
        blockedLegacyProjectRef,
      );
    } catch (error) {
      if (
        error instanceof InviteEnvironmentError &&
        error.code === "AUTH_INVITE_PROJECT_MISMATCH" &&
        /Legacy/.test(error.message)
      ) {
        throw error;
      }
      // Mock mode may use placeholder hosts in unit tests; only legacy is hard-blocked.
    }
  }

  return {
    mode: parsedMode.data,
    appUrl,
    redirectPath,
    redirectTo: redirectUrl.toString(),
    supabaseUrl,
    secretKey,
    expectedProjectRef,
    blockedLegacyProjectRef,
  };
}

export function buildInviteRedirectTo(environment: InviteEnvironment): string {
  return environment.redirectTo;
}
