import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import {
  DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF,
  DEFAULT_EXPECTED_SUPABASE_PROJECT_REF,
} from "@/lib/auth/invite-env";

export const STAFF_AUTH_ERROR_CODES = [
  "STAFF_AUTH_UNAVAILABLE",
  "STAFF_AUTH_PROJECT_MISMATCH",
  "STAFF_AUTH_EMAIL_INVALID",
  "STAFF_AUTH_ALREADY_EXISTS",
  "STAFF_AUTH_ADMIN_KEY_INVALID",
  "STAFF_AUTH_RATE_LIMITED",
  "STAFF_AUTH_NETWORK_ERROR",
  "STAFF_AUTH_RESPONSE_INVALID",
  "STAFF_AUTH_FAILED",
] as const;

export type StaffAuthErrorCode = (typeof STAFF_AUTH_ERROR_CODES)[number];

export const STAFF_AUTH_ERROR_MESSAGES_TH: Record<StaffAuthErrorCode, string> = {
  STAFF_AUTH_UNAVAILABLE: "ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบยืนยันตัวตน (Supabase Admin)",
  STAFF_AUTH_PROJECT_MISMATCH: "โครงการ Supabase ไม่ตรงกับระบบที่กำหนด",
  STAFF_AUTH_EMAIL_INVALID: "รูปแบบอีเมลไม่ถูกต้อง",
  STAFF_AUTH_ALREADY_EXISTS: "อีเมลนี้มีบัญชีในระบบยืนยันตัวตนแล้ว",
  STAFF_AUTH_ADMIN_KEY_INVALID: "ระบบยืนยันตัวตนปฏิเสธสิทธิ์ผู้ดูแล",
  STAFF_AUTH_RATE_LIMITED: "ดำเนินการถี่เกินไป กรุณารอสักครู่",
  STAFF_AUTH_NETWORK_ERROR: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้",
  STAFF_AUTH_RESPONSE_INVALID: "ระบบยืนยันตัวตนตอบกลับไม่ถูกต้อง",
  STAFF_AUTH_FAILED: "ดำเนินการกับระบบยืนยันตัวตนไม่สำเร็จ",
};

export class StaffAuthError extends Error {
  constructor(readonly code: StaffAuthErrorCode) {
    super(STAFF_AUTH_ERROR_MESSAGES_TH[code]);
    this.name = "StaffAuthError";
  }
}

export type StaffAuthUser = { authUserId: string; email: string };

/**
 * Identity operations Platform Admin needs for GoldenSoft's own employees.
 * Kept as a port so the domain layer stays testable without Supabase.
 */
export interface StaffAuthPort {
  getUserByEmail(email: string): Promise<StaffAuthUser | null>;
  createUser(input: {
    email: string;
    displayName: string;
    password: string;
    /** E.164 phone — optional, for phone login without OTP. */
    phone?: string | null;
  }): Promise<StaffAuthUser>;
  setPassword(input: { authUserId: string; password: string }): Promise<void>;
  /** Attach/update a confirmed phone so the same password works via phone login. */
  updateUserPhone?(input: {
    authUserId: string;
    phone: string;
  }): Promise<void>;
}

/** URL-safe random secret used as a placeholder password nobody knows. */
export function generateUnguessablePassword(): string {
  return randomBytes(32).toString("base64url");
}

export type StaffAuthConfig = {
  supabaseUrl: string;
  secretKey: string;
};

/** Resolve + validate Supabase Admin configuration, blocking the legacy project. */
export function resolveStaffAuthConfig(
  env: Record<string, string | undefined> = process.env,
): StaffAuthConfig {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!supabaseUrl || !secretKey) {
    throw new StaffAuthError("STAFF_AUTH_UNAVAILABLE");
  }

  const expected = (
    env.EXPECTED_SUPABASE_PROJECT_REF ?? DEFAULT_EXPECTED_SUPABASE_PROJECT_REF
  )
    .trim()
    .toLowerCase();
  const blocked = (
    env.BLOCKED_LEGACY_SUPABASE_PROJECT_REF ??
    DEFAULT_BLOCKED_LEGACY_SUPABASE_PROJECT_REF
  )
    .trim()
    .toLowerCase();

  let host: string;
  try {
    host = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    throw new StaffAuthError("STAFF_AUTH_PROJECT_MISMATCH");
  }
  if (!expected || (blocked && host.includes(blocked))) {
    throw new StaffAuthError("STAFF_AUTH_PROJECT_MISMATCH");
  }
  if (host !== `${expected}.supabase.co`) {
    throw new StaffAuthError("STAFF_AUTH_PROJECT_MISMATCH");
  }

  return { supabaseUrl, secretKey };
}

const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});

const usersResponseSchema = z.union([
  z.array(authUserSchema),
  z.object({ users: z.array(authUserSchema) }),
]);

type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Supabase Auth Admin REST adapter — never sends email, admin-driven only. */
export class SupabaseStaffAuthAdapter implements StaffAuthPort {
  constructor(
    private readonly config: StaffAuthConfig & {
      timeoutMs?: number;
      fetchTransport?: FetchTransport;
    },
  ) {}

  async getUserByEmail(rawEmail: string): Promise<StaffAuthUser | null> {
    const email = rawEmail.trim().toLowerCase();
    const perPage = 100;
    for (let page = 1; page <= 50; page += 1) {
      const body = await this.request(
        `/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        { method: "GET" },
      );
      const parsed = usersResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new StaffAuthError("STAFF_AUTH_RESPONSE_INVALID");
      }
      const users = Array.isArray(parsed.data) ? parsed.data : parsed.data.users;
      const match = users.find((item) => item.email.toLowerCase() === email);
      if (match) {
        return { authUserId: match.id, email: match.email.toLowerCase() };
      }
      if (users.length < perPage) return null;
    }
    return null;
  }

  async createUser(input: {
    email: string;
    displayName: string;
    password: string;
    phone?: string | null;
  }): Promise<StaffAuthUser> {
    const email = input.email.trim().toLowerCase();
    const phone = input.phone?.trim() || null;
    const body = await this.request("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: input.password,
        // Admin-created accounts are pre-confirmed: user sets password once
        // via empty-password login (no email invite / OTP).
        email_confirm: true,
        ...(phone
          ? {
              phone,
              phone_confirm: true,
            }
          : {}),
        user_metadata: { display_name: input.displayName.trim() },
      }),
    });
    const parsed = authUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new StaffAuthError("STAFF_AUTH_RESPONSE_INVALID");
    }
    return { authUserId: parsed.data.id, email: parsed.data.email.toLowerCase() };
  }

  async setPassword(input: {
    authUserId: string;
    password: string;
  }): Promise<void> {
    await this.request(`/auth/v1/admin/users/${input.authUserId}`, {
      method: "PUT",
      body: JSON.stringify({ password: input.password }),
    });
  }

  async updateUserPhone(input: {
    authUserId: string;
    phone: string;
  }): Promise<void> {
    await this.request(`/auth/v1/admin/users/${input.authUserId}`, {
      method: "PUT",
      body: JSON.stringify({
        phone: input.phone.trim(),
        phone_confirm: true,
      }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const transport = this.config.fetchTransport ?? fetch;
    const timeoutMs = this.config.timeoutMs ?? 10_000;
    let response: Response;
    try {
      response = await transport(new URL(path, this.config.supabaseUrl), {
        ...init,
        headers: {
          apikey: this.config.secretKey,
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new StaffAuthError("STAFF_AUTH_NETWORK_ERROR");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new StaffAuthError(mapStaffAuthHttpError(response.status, body));
    }
    return body;
  }
}

/** In-memory adapter for tests and local verification — no network. */
export class InMemoryStaffAuthAdapter implements StaffAuthPort {
  private readonly users = new Map<string, StaffAuthUser>();
  readonly passwords = new Map<string, string>();

  constructor(seed: StaffAuthUser[] = []) {
    for (const user of seed) {
      const email = user.email.trim().toLowerCase();
      this.users.set(email, { ...user, email });
    }
  }

  async getUserByEmail(email: string): Promise<StaffAuthUser | null> {
    return this.users.get(email.trim().toLowerCase()) ?? null;
  }

  async createUser(input: {
    email: string;
    displayName: string;
    password: string;
    phone?: string | null;
  }): Promise<StaffAuthUser> {
    const email = input.email.trim().toLowerCase();
    if (this.users.has(email)) {
      throw new StaffAuthError("STAFF_AUTH_ALREADY_EXISTS");
    }
    const user: StaffAuthUser = { authUserId: randomUUID(), email };
    this.users.set(email, user);
    this.passwords.set(user.authUserId, input.password);
    void input.phone;
    return user;
  }

  async setPassword(input: {
    authUserId: string;
    password: string;
  }): Promise<void> {
    this.passwords.set(input.authUserId, input.password);
  }

  async updateUserPhone(_input: {
    authUserId: string;
    phone: string;
  }): Promise<void> {
    // In-memory auth has no phone identity; email login path covers tests.
  }
}

function mapStaffAuthHttpError(
  status: number,
  body: unknown,
): StaffAuthErrorCode {
  const text =
    body && typeof body === "object"
      ? Object.values(body as Record<string, unknown>)
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase()
      : "";
  if (status === 429) return "STAFF_AUTH_RATE_LIMITED";
  if (status === 401 || status === 403) return "STAFF_AUTH_ADMIN_KEY_INVALID";
  if (/already|registered|exists/.test(text)) return "STAFF_AUTH_ALREADY_EXISTS";
  if (/email/.test(text) && /invalid/.test(text)) {
    return "STAFF_AUTH_EMAIL_INVALID";
  }
  return "STAFF_AUTH_FAILED";
}

export function createStaffAuthAdapter(
  options: {
    env?: Record<string, string | undefined>;
    fetchTransport?: FetchTransport;
  } = {},
): StaffAuthPort {
  const config = resolveStaffAuthConfig(options.env ?? process.env);
  return new SupabaseStaffAuthAdapter({
    ...config,
    fetchTransport: options.fetchTransport,
  });
}
