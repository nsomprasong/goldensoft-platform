import { createHash } from "node:crypto";

import { z } from "zod";

import type { InviteEnvironment } from "@/lib/auth/invite-env";

export const AUTH_INVITE_ERROR_CODES = [
  "AUTH_INVITE_EMAIL_INVALID",
  "AUTH_INVITE_ALREADY_EXISTS",
  "AUTH_INVITE_RATE_LIMITED",
  "AUTH_INVITE_ADMIN_KEY_INVALID",
  "AUTH_INVITE_PROJECT_MISMATCH",
  "AUTH_INVITE_REDIRECT_INVALID",
  "AUTH_INVITE_NETWORK_ERROR",
  "AUTH_INVITE_RESPONSE_INVALID",
  "AUTH_INVITE_FAILED",
] as const;

export type AuthInviteErrorCode = (typeof AUTH_INVITE_ERROR_CODES)[number];

export const AUTH_INVITE_ERROR_MESSAGES_TH: Record<AuthInviteErrorCode, string> = {
  AUTH_INVITE_EMAIL_INVALID: "รูปแบบอีเมลไม่ถูกต้อง",
  AUTH_INVITE_ALREADY_EXISTS: "บัญชีนี้มีอยู่แล้วในระบบยืนยันตัวตน",
  AUTH_INVITE_RATE_LIMITED: "ส่งคำเชิญถี่เกินไป กรุณารอสักครู่",
  AUTH_INVITE_ADMIN_KEY_INVALID: "ระบบยืนยันตัวตนปฏิเสธสิทธิ์ผู้ดูแล",
  AUTH_INVITE_PROJECT_MISMATCH: "โครงการ Supabase ไม่ตรงกับระบบที่กำหนด",
  AUTH_INVITE_REDIRECT_INVALID: "ปลายทางคำเชิญไม่ถูกต้อง",
  AUTH_INVITE_NETWORK_ERROR: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้",
  AUTH_INVITE_RESPONSE_INVALID: "ระบบยืนยันตัวตนตอบกลับไม่ถูกต้อง",
  AUTH_INVITE_FAILED: "ส่งคำเชิญไม่สำเร็จ",
};

export class AuthInviteError extends Error {
  constructor(readonly code: AuthInviteErrorCode) {
    super(AUTH_INVITE_ERROR_MESSAGES_TH[code]);
    this.name = "AuthInviteError";
  }
}

export type AuthInviteResult = {
  authUserId: string;
  email: string;
  invited: boolean;
  reused: boolean;
  emailConfirmed: boolean;
};

export type AuthUserLookupResult =
  | { found: false }
  | {
      found: true;
      authUserId: string;
      email: string;
      emailConfirmed: boolean;
    };

export interface AuthInviteAdapter {
  inviteUser(input: {
    email: string;
    displayName: string;
    redirectTo: string;
  }): Promise<AuthInviteResult>;
  resendInvite(input: {
    email: string;
    redirectTo: string;
  }): Promise<AuthInviteResult>;
  getUserByEmail(email: string): Promise<AuthUserLookupResult>;
}

type MockUser = {
  authUserId: string;
  email: string;
  emailConfirmed: boolean;
};

export class MockAuthInviteAdapter implements AuthInviteAdapter {
  private readonly users = new Map<string, MockUser>();
  readonly sent: Array<{ email: string; redirectTo: string; resend: boolean }> = [];

  constructor(seed: MockUser[] = []) {
    for (const user of seed) {
      this.users.set(user.email.trim().toLowerCase(), {
        ...user,
        email: user.email.trim().toLowerCase(),
      });
    }
  }

  async getUserByEmail(email: string): Promise<AuthUserLookupResult> {
    const user = this.users.get(email.trim().toLowerCase());
    return user ? { found: true, ...user } : { found: false };
  }

  async inviteUser(input: {
    email: string;
    displayName: string;
    redirectTo: string;
  }): Promise<AuthInviteResult> {
    return this.send(input.email, input.redirectTo, false);
  }

  async resendInvite(input: {
    email: string;
    redirectTo: string;
  }): Promise<AuthInviteResult> {
    return this.send(input.email, input.redirectTo, true);
  }

  private async send(
    rawEmail: string,
    redirectTo: string,
    resend: boolean,
  ): Promise<AuthInviteResult> {
    const email = rawEmail.trim().toLowerCase();
    const existing = this.users.get(email);
    if (existing?.emailConfirmed) {
      return {
        ...existing,
        invited: false,
        reused: true,
      };
    }
    const user =
      existing ??
      ({
        authUserId: deterministicMockUuid(email),
        email,
        emailConfirmed: false,
      } satisfies MockUser);
    this.users.set(email, user);
    this.sent.push({ email, redirectTo, resend });
    return {
      ...user,
      invited: true,
      reused: Boolean(existing),
    };
  }
}

function deterministicMockUuid(email: string): string {
  const hex = createHash("sha256").update(`goldensoft-mock:${email}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  email_confirmed_at: z.string().nullable().optional(),
  confirmed_at: z.string().nullable().optional(),
});

const usersResponseSchema = z.union([
  z.array(authUserSchema),
  z.object({ users: z.array(authUserSchema) }),
]);

type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class SupabaseAuthInviteAdapter implements AuthInviteAdapter {
  constructor(
    private readonly config: {
      supabaseUrl: string;
      secretKey: string;
      expectedProjectRef: string;
      blockedLegacyProjectRef: string;
      timeoutMs?: number;
      fetchTransport?: FetchTransport;
    },
  ) {
    let host: string;
    try {
      host = new URL(config.supabaseUrl).hostname.toLowerCase();
    } catch {
      throw new AuthInviteError("AUTH_INVITE_PROJECT_MISMATCH");
    }
    const expected = config.expectedProjectRef.trim().toLowerCase();
    const blocked = config.blockedLegacyProjectRef.trim().toLowerCase();
    if (!expected || host === `${blocked}.supabase.co` || host.includes(blocked)) {
      throw new AuthInviteError("AUTH_INVITE_PROJECT_MISMATCH");
    }
    if (host !== `${expected}.supabase.co`) {
      throw new AuthInviteError("AUTH_INVITE_PROJECT_MISMATCH");
    }
  }

  async getUserByEmail(rawEmail: string): Promise<AuthUserLookupResult> {
    const email = rawEmail.trim().toLowerCase();
    for (let page = 1; page <= 50; page += 1) {
      const response = await this.request(
        `/auth/v1/admin/users?page=${page}&per_page=100`,
        { method: "GET" },
      );
      const parsed = usersResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new AuthInviteError("AUTH_INVITE_RESPONSE_INVALID");
      }
      const users = Array.isArray(parsed.data) ? parsed.data : parsed.data.users;
      const user = users.find((item) => item.email.toLowerCase() === email);
      if (user) {
        return {
          found: true,
          authUserId: user.id,
          email: user.email.toLowerCase(),
          emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
        };
      }
      if (users.length < 100) return { found: false };
    }
    return { found: false };
  }

  async inviteUser(input: {
    email: string;
    displayName: string;
    redirectTo: string;
  }): Promise<AuthInviteResult> {
    return this.send(input.email, input.redirectTo, {
      display_name: input.displayName,
    });
  }

  async resendInvite(input: {
    email: string;
    redirectTo: string;
  }): Promise<AuthInviteResult> {
    const existing = await this.getUserByEmail(input.email);
    if (!existing.found) {
      throw new AuthInviteError("AUTH_INVITE_FAILED");
    }
    if (existing.emailConfirmed) {
      return { ...existing, invited: false, reused: true };
    }
    const redirect = validateRedirect(input.redirectTo);
    const query = new URLSearchParams({ redirect_to: redirect.toString() });
    const response = await this.request(`/auth/v1/resend?${query}`, {
      method: "POST",
      body: JSON.stringify({
        email: existing.email,
        type: "invite",
      }),
    });
    if (!z.object({}).passthrough().safeParse(response).success) {
      throw new AuthInviteError("AUTH_INVITE_RESPONSE_INVALID");
    }
    return {
      ...existing,
      invited: true,
      reused: true,
    };
  }

  private async send(
    rawEmail: string,
    redirectTo: string,
    data?: { display_name: string },
  ): Promise<AuthInviteResult> {
    const email = rawEmail.trim().toLowerCase();
    const redirect = validateRedirect(redirectTo);
    const query = new URLSearchParams({ redirect_to: redirect.toString() });
    const response = await this.request(`/auth/v1/invite?${query}`, {
      method: "POST",
      body: JSON.stringify({ email, data }),
    });
    const parsed = authUserSchema.safeParse(response);
    if (!parsed.success) {
      throw new AuthInviteError("AUTH_INVITE_RESPONSE_INVALID");
    }
    return {
      authUserId: parsed.data.id,
      email: parsed.data.email.toLowerCase(),
      invited: true,
      reused: false,
      emailConfirmed: Boolean(
        parsed.data.email_confirmed_at ?? parsed.data.confirmed_at,
      ),
    };
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
      throw new AuthInviteError("AUTH_INVITE_NETWORK_ERROR");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AuthInviteError(mapAuthHttpError(response.status, body));
    }
    return body;
  }
}

function validateRedirect(redirectTo: string): URL {
  if (
    redirectTo.startsWith("//") ||
    /^(javascript|data):/i.test(redirectTo)
  ) {
    throw new AuthInviteError("AUTH_INVITE_REDIRECT_INVALID");
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectTo);
  } catch {
    throw new AuthInviteError("AUTH_INVITE_REDIRECT_INVALID");
  }
  if (
    redirect.protocol !== "https:" &&
    !(redirect.protocol === "http:" && redirect.hostname === "localhost")
  ) {
    throw new AuthInviteError("AUTH_INVITE_REDIRECT_INVALID");
  }
  if (redirect.username || redirect.password) {
    throw new AuthInviteError("AUTH_INVITE_REDIRECT_INVALID");
  }
  return redirect;
}

function mapAuthHttpError(status: number, body: unknown): AuthInviteErrorCode {
  const text =
    body && typeof body === "object"
      ? Object.values(body as Record<string, unknown>)
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase()
      : "";
  if (status === 429) return "AUTH_INVITE_RATE_LIMITED";
  if (status === 401 || status === 403) return "AUTH_INVITE_ADMIN_KEY_INVALID";
  if (/redirect/.test(text)) return "AUTH_INVITE_REDIRECT_INVALID";
  if (/already|registered|exists/.test(text)) return "AUTH_INVITE_ALREADY_EXISTS";
  if (/email/.test(text) && /invalid/.test(text)) {
    return "AUTH_INVITE_EMAIL_INVALID";
  }
  return "AUTH_INVITE_FAILED";
}

export function createAuthInviteAdapter(
  environment: InviteEnvironment,
  options: {
    fetchTransport?: FetchTransport;
  } = {},
): AuthInviteAdapter {
  if (environment.mode === "mock") return new MockAuthInviteAdapter();
  if (!environment.secretKey) {
    throw new AuthInviteError("AUTH_INVITE_ADMIN_KEY_INVALID");
  }
  return new SupabaseAuthInviteAdapter({
    supabaseUrl: environment.supabaseUrl,
    secretKey: environment.secretKey,
    expectedProjectRef: environment.expectedProjectRef,
    blockedLegacyProjectRef: environment.blockedLegacyProjectRef,
    fetchTransport: options.fetchTransport,
  });
}
