import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { MASTER } from "@/lib/platform/master-codes";
import { getMasterByCode } from "@/lib/platform/master-data";

export const BOOTSTRAP_CONFIRM_VALUE = "CREATE_FIRST_SUPER_ADMIN";
export const BOOTSTRAP_AUDIT_ACTION = "bootstrap.first_super_admin";
export const BOOTSTRAP_SOURCE = "bootstrap-script";
/** Timeout for Auth Admin REST lookup (no Realtime / WebSocket). */
export const AUTH_ADMIN_LOOKUP_TIMEOUT_MS = 15_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BootstrapEnvInput = {
  authUserId: string;
  adminEmail: string;
  displayName: string;
  organizationCode: string;
  branchCode: string | null;
  confirm: string | null;
};

export type BootstrapAuthUser = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
};

export type BootstrapErrorCode =
  | "INVALID_UUID"
  | "MISSING_ENV"
  | "AUTH_USER_NOT_FOUND"
  | "EMAIL_MISMATCH"
  | "EMAIL_NOT_CONFIRMED"
  | "ORGANIZATION_NOT_FOUND"
  | "BRANCH_NOT_FOUND"
  | "BRANCH_REQUIRED"
  | "PROFILE_CONFLICT"
  | "ROLE_SUPER_ADMIN_MISSING"
  | "ROLE_OWNER_MISSING"
  | "MASTER_MISSING"
  | "CONFIRMATION_REQUIRED"
  | "MEMBERSHIP_CONFLICT";

export class BootstrapError extends Error {
  readonly code: BootstrapErrorCode;

  constructor(code: BootstrapErrorCode, message: string) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

export type PlannedChange =
  | "สร้างหรือใช้ซ้ำโปรไฟล์ผู้ใช้"
  | "กำหนดบทบาท SUPER_ADMIN"
  | "สร้างหรือใช้ซ้ำการเป็นสมาชิกองค์กร (OWNER)"
  | "กำหนดสิทธิ์เข้าถึงสาขา"
  | "บันทึกเหตุการณ์ audit";

export type BootstrapPreview = {
  projectRef: string;
  maskedEmail: string;
  organizationCode: string;
  branchCode: string | null;
  changes: PlannedChange[];
  writeOperations: "NONE" | "TRANSACTION";
  confirmed: boolean;
};

export type BootstrapWriteCounts = {
  profilesCreated: number;
  platformRolesCreated: number;
  membershipsCreated: number;
  membershipRolesCreated: number;
  branchScopesCreated: number;
  auditsCreated: number;
  reused: number;
};

export type BootstrapExecuteResult = {
  ok: true;
  dryRun: boolean;
  preview: BootstrapPreview;
  counts: BootstrapWriteCounts;
  maskedProfileId: string | null;
  maskedOrganizationId: string | null;
  maskedBranchId: string | null;
};

export type VerifyCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type VerifyResult = {
  ok: boolean;
  checks: VerifyCheck[];
};

type DbClient = PrismaClient;
type TxClient = Prisma.TransactionClient;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "***";
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

export function maskUuid(id: string): string {
  if (!isValidUuid(id)) return "********";
  return `${id.slice(0, 8)}-****-****-****-${id.slice(-4)}`;
}

export function parseBootstrapEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): BootstrapEnvInput {
  const authUserId = (env.BOOTSTRAP_AUTH_USER_ID ?? "").trim();
  const adminEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const displayName = (env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? "").trim();
  const organizationCode = (env.BOOTSTRAP_ORGANIZATION_CODE ?? "").trim();
  const branchRaw = (env.BOOTSTRAP_BRANCH_CODE ?? "").trim();
  const confirm = (env.BOOTSTRAP_CONFIRM ?? "").trim() || null;

  if (!authUserId || !adminEmail || !displayName || !organizationCode) {
    throw new BootstrapError(
      "MISSING_ENV",
      "ต้องกำหนด BOOTSTRAP_AUTH_USER_ID, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_DISPLAY_NAME และ BOOTSTRAP_ORGANIZATION_CODE",
    );
  }

  if (!isValidUuid(authUserId)) {
    throw new BootstrapError(
      "INVALID_UUID",
      "BOOTSTRAP_AUTH_USER_ID ต้องเป็น UUID ที่ถูกต้อง",
    );
  }

  return {
    authUserId,
    adminEmail,
    displayName,
    organizationCode,
    branchCode: branchRaw || null,
    confirm,
  };
}

export function hasBootstrapConfirmation(confirm: string | null): boolean {
  return confirm === BOOTSTRAP_CONFIRM_VALUE;
}

export function buildBootstrapPreview(input: {
  projectRef: string;
  email: string;
  organizationCode: string;
  branchCode: string | null;
  confirmed: boolean;
}): BootstrapPreview {
  return {
    projectRef: input.projectRef,
    maskedEmail: maskEmail(input.email),
    organizationCode: input.organizationCode,
    branchCode: input.branchCode,
    changes: [
      "สร้างหรือใช้ซ้ำโปรไฟล์ผู้ใช้",
      "กำหนดบทบาท SUPER_ADMIN",
      "สร้างหรือใช้ซ้ำการเป็นสมาชิกองค์กร (OWNER)",
      "กำหนดสิทธิ์เข้าถึงสาขา",
      "บันทึกเหตุการณ์ audit",
    ],
    writeOperations: input.confirmed ? "TRANSACTION" : "NONE",
    confirmed: input.confirmed,
  };
}

function emptyCounts(): BootstrapWriteCounts {
  return {
    profilesCreated: 0,
    platformRolesCreated: 0,
    membershipsCreated: 0,
    membershipRolesCreated: 0,
    branchScopesCreated: 0,
    auditsCreated: 0,
    reused: 0,
  };
}

async function requireMaster(
  db: TxClient | DbClient,
  table:
    | "userProfileStatus"
    | "platformRole"
    | "assignmentStatus"
    | "membershipStatus"
    | "organizationRole"
    | "branchScopeType"
    | "branchStatus",
  code: string,
  missingCode: BootstrapErrorCode,
  thaiMessage: string,
): Promise<{ id: string; code: string }> {
  const row = await getMasterByCode(db as DbClient, table, code);
  if (!row || !row.isActive) {
    throw new BootstrapError(missingCode, thaiMessage);
  }
  return { id: row.id, code: row.code };
}

async function ensureAuditAction(tx: TxClient) {
  return tx.auditActionType.upsert({
    where: { code: BOOTSTRAP_AUDIT_ACTION },
    create: {
      code: BOOTSTRAP_AUDIT_ACTION,
      nameTh: "สร้างผู้ดูแลระบบสูงสุดครั้งแรก",
      nameEn: "Bootstrap first super admin",
      sortOrder: 200,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
}

export async function resolveBootstrapAuthUser(
  lookup: (id: string) => Promise<BootstrapAuthUser | null>,
  input: BootstrapEnvInput,
): Promise<BootstrapAuthUser> {
  const user = await lookup(input.authUserId);
  if (!user) {
    throw new BootstrapError(
      "AUTH_USER_NOT_FOUND",
      "ไม่พบบัญชีผู้ใช้งานใน Supabase Auth",
    );
  }

  const authEmail = user.email.trim().toLowerCase();
  if (authEmail !== input.adminEmail) {
    throw new BootstrapError(
      "EMAIL_MISMATCH",
      "อีเมลของบัญชี Auth ไม่ตรงกับ BOOTSTRAP_ADMIN_EMAIL",
    );
  }

  if (!user.emailConfirmedAt) {
    throw new BootstrapError(
      "EMAIL_NOT_CONFIRMED",
      "อีเมลยังไม่ได้รับการยืนยัน",
    );
  }

  return { ...user, email: authEmail };
}

/**
 * Safe, actionable failure codes for the Supabase Auth Admin lookup step.
 * These never carry secrets, raw response bodies, full UUIDs, or full emails.
 */
export type AuthLookupErrorCode =
  | "AUTH_ADMIN_KEY_MISSING"
  | "AUTH_ADMIN_KEY_INVALID"
  | "AUTH_PROJECT_MISMATCH"
  | "AUTH_USER_NOT_FOUND"
  | "AUTH_USER_ID_INVALID"
  | "AUTH_EMAIL_MISMATCH"
  | "AUTH_EMAIL_NOT_CONFIRMED"
  | "AUTH_API_UNREACHABLE"
  | "AUTH_RESPONSE_INVALID"
  | "AUTH_LOOKUP_FAILED";

export const AUTH_LOOKUP_MESSAGES: Record<AuthLookupErrorCode, string> = {
  AUTH_ADMIN_KEY_MISSING:
    "ไม่พบ SUPABASE_SECRET_KEY สำหรับเรียก Supabase Auth Admin",
  AUTH_ADMIN_KEY_INVALID:
    "SUPABASE_SECRET_KEY ถูกปฏิเสธ (unauthorized) โปรดตรวจ secret key ของโปรเจกต์",
  AUTH_PROJECT_MISMATCH:
    "Secret key ไม่ตรงกับโปรเจกต์ของ NEXT_PUBLIC_SUPABASE_URL",
  AUTH_USER_NOT_FOUND:
    "ไม่พบบัญชีผู้ใช้งานใน Supabase Auth ตาม BOOTSTRAP_AUTH_USER_ID",
  AUTH_USER_ID_INVALID: "BOOTSTRAP_AUTH_USER_ID ไม่ใช่ UUID ที่ถูกต้อง",
  AUTH_EMAIL_MISMATCH:
    "อีเมลของบัญชี Auth ไม่ตรงกับ BOOTSTRAP_ADMIN_EMAIL",
  AUTH_EMAIL_NOT_CONFIRMED: "อีเมลของบัญชี Auth ยังไม่ได้รับการยืนยัน",
  AUTH_API_UNREACHABLE:
    "เชื่อมต่อ Supabase Auth ไม่ได้ (network/timeout/5xx)",
  AUTH_RESPONSE_INVALID:
    "คำตอบจาก Supabase Auth Admin มีรูปแบบไม่ถูกต้อง",
  AUTH_LOOKUP_FAILED: "ตรวจสอบ Supabase Auth ไม่สำเร็จด้วยสาเหตุที่ไม่คาดคิด",
};

/** Minimal, safe view of `supabase.auth.admin.getUserById` output. */
export type SupabaseAdminUser = {
  id?: string | null;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export type SupabaseAdminError = {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
};

export type SupabaseAdminGetUserResponse = {
  data?: { user?: SupabaseAdminUser | null } | null;
  error?: SupabaseAdminError | null;
};

export type AuthLookupInput = {
  authUserId: string;
  adminEmail: string;
  secretKeyPresent: boolean;
};

export type AuthLookupOutcome =
  | { ok: true; user: BootstrapAuthUser }
  | { ok: false; code: AuthLookupErrorCode; httpStatus?: number };

function classifyThrownAuthError(thrown: unknown): AuthLookupErrorCode {
  const message =
    thrown instanceof Error ? thrown.message : String(thrown ?? "");
  const name = thrown instanceof Error ? thrown.name : "";
  const lower = message.toLowerCase();
  const unreachable = [
    "fetch failed",
    "network",
    "enotfound",
    "econnrefused",
    "econnreset",
    "etimedout",
    "timeout",
    "aborted",
    "abort",
    "und_err",
    "getaddrinfo",
    "socket hang up",
  ];
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    unreachable.some((needle) => lower.includes(needle))
  ) {
    return "AUTH_API_UNREACHABLE";
  }
  return "AUTH_LOOKUP_FAILED";
}

function classifyAuthAdminError(error: SupabaseAdminError): {
  code: AuthLookupErrorCode;
  httpStatus?: number;
} {
  const status = typeof error.status === "number" ? error.status : undefined;
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();

  if (
    code.includes("project") ||
    message.includes("project not specified") ||
    message.includes("wrong project")
  ) {
    return { code: "AUTH_PROJECT_MISMATCH", httpStatus: status };
  }
  if (
    status === 401 ||
    status === 403 ||
    code.includes("invalid_api_key") ||
    code.includes("bad_jwt") ||
    code.includes("unauthorized") ||
    message.includes("api key") ||
    message.includes("unauthorized")
  ) {
    return { code: "AUTH_ADMIN_KEY_INVALID", httpStatus: status };
  }
  if (status === 404 || code.includes("user_not_found")) {
    return { code: "AUTH_USER_NOT_FOUND", httpStatus: status };
  }
  if (
    status === 400 &&
    (message.includes("uuid") || message.includes("invalid id"))
  ) {
    return { code: "AUTH_USER_ID_INVALID", httpStatus: status };
  }
  if (status !== undefined && status >= 500) {
    return { code: "AUTH_API_UNREACHABLE", httpStatus: status };
  }
  return { code: "AUTH_LOOKUP_FAILED", httpStatus: status };
}

/**
 * Classify the Auth Admin lookup into a single safe outcome.
 *
 * Validation order (fail fast, no network required for the first two):
 * 1. secret key presence, 2. UUID shape, 3. thrown transport errors,
 * 4. Supabase `error`, 5. missing user, 6. email mismatch/confirmation.
 */
export function evaluateAuthAdminLookup(
  input: AuthLookupInput,
  response: SupabaseAdminGetUserResponse | null,
  thrown?: unknown,
): AuthLookupOutcome {
  if (!input.secretKeyPresent) {
    return { ok: false, code: "AUTH_ADMIN_KEY_MISSING" };
  }
  if (!isValidUuid(input.authUserId)) {
    return { ok: false, code: "AUTH_USER_ID_INVALID" };
  }
  if (thrown !== undefined) {
    return { ok: false, code: classifyThrownAuthError(thrown) };
  }

  const error = response?.error ?? null;
  if (error) {
    return { ok: false, ...classifyAuthAdminError(error) };
  }

  const user = response?.data?.user ?? null;
  if (!user || !user.id) {
    return { ok: false, code: "AUTH_USER_NOT_FOUND", httpStatus: 404 };
  }

  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || email !== input.adminEmail.trim().toLowerCase()) {
    return { ok: false, code: "AUTH_EMAIL_MISMATCH" };
  }

  const confirmedAt = user.email_confirmed_at ?? user.confirmed_at ?? null;
  if (!confirmedAt) {
    return { ok: false, code: "AUTH_EMAIL_NOT_CONFIRMED" };
  }

  return {
    ok: true,
    user: { id: user.id, email, emailConfirmedAt: confirmedAt },
  };
}

/**
 * Render a failed Auth lookup outcome as safe, human-readable Thai lines.
 * Guarantees: no secret key, no Authorization header, no raw body,
 * no full UUID, and no full email are ever included.
 */
export function formatAuthLookupDiagnostic(
  outcome: Extract<AuthLookupOutcome, { ok: false }>,
  context: { projectRef: string; authUserId: string; adminEmail: string },
): string[] {
  const lines = [
    `[AUTH] ${outcome.code}: ${AUTH_LOOKUP_MESSAGES[outcome.code]}`,
  ];
  if (typeof outcome.httpStatus === "number") {
    lines.push(`HTTP status: ${outcome.httpStatus}`);
  }
  lines.push(`project ref: ${context.projectRef}`);
  lines.push(`auth user id: ${maskUuid(context.authUserId)}`);
  lines.push(`อีเมล: ${maskEmail(context.adminEmail)}`);
  return lines;
}

/**
 * Zod schema for Auth Admin GET /auth/v1/admin/users/:id success body.
 * GoTrue returns the user object directly (SDK wraps it as `{ user }`).
 */
const authAdminUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable().optional(),
  email_confirmed_at: z.string().nullable().optional(),
  confirmed_at: z.string().nullable().optional(),
});

const authAdminErrorBodySchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    error_code: z.string().optional(),
    error: z.string().optional(),
    msg: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

function buildAuthAdminUsersUrl(supabaseUrl: string, authUserId: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`;
}

function parseAuthAdminErrorBody(raw: unknown): SupabaseAdminError {
  const parsed = authAdminErrorBodySchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const body = parsed.data;
  const code =
    typeof body.error_code === "string"
      ? body.error_code
      : typeof body.code === "string"
        ? body.code
        : typeof body.code === "number"
          ? String(body.code)
          : body.error;
  const message = body.msg ?? body.message ?? body.error;
  return { code, message };
}

/**
 * Server-only Auth Admin lookup via REST.
 *
 * Does not use the Supabase JS SDK client factory: that path always constructs a
 * realtime socket client and fails on Node.js 20 without a websocket polyfill.
 * Bootstrap/verify only need Auth Admin over HTTPS — never realtime channels.
 */
export async function fetchAuthAdminUserById(options: {
  supabaseUrl: string;
  secretKey: string;
  authUserId: string;
  adminEmail: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AuthLookupOutcome> {
  const secretKeyPresent = options.secretKey.trim().length > 0;
  const lookupInput: AuthLookupInput = {
    authUserId: options.authUserId,
    adminEmail: options.adminEmail,
    secretKeyPresent,
  };

  if (!options.supabaseUrl.trim() || !secretKeyPresent) {
    return evaluateAuthAdminLookup(lookupInput, null);
  }
  if (!isValidUuid(options.authUserId)) {
    return evaluateAuthAdminLookup(lookupInput, null);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? AUTH_ADMIN_LOOKUP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      buildAuthAdminUsersUrl(options.supabaseUrl, options.authUserId),
      {
        method: "GET",
        headers: {
          apikey: options.secretKey,
          Authorization: `Bearer ${options.secretKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      if (response.ok) {
        return {
          ok: false,
          code: "AUTH_RESPONSE_INVALID",
          httpStatus: response.status,
        };
      }
      return {
        ok: false,
        ...classifyAuthAdminError({ status: response.status }),
      };
    }

    if (!response.ok) {
      const error = parseAuthAdminErrorBody(body);
      return {
        ok: false,
        ...classifyAuthAdminError({
          status: response.status,
          code: error.code,
          message: error.message,
        }),
      };
    }

    const userParsed = authAdminUserSchema.safeParse(body);
    if (!userParsed.success) {
      // Some gateways wrap the user; accept `{ user: {...} }` as a fallback.
      const wrapped = z.object({ user: authAdminUserSchema }).safeParse(body);
      if (!wrapped.success) {
        return {
          ok: false,
          code: "AUTH_RESPONSE_INVALID",
          httpStatus: response.status,
        };
      }
      return evaluateAuthAdminLookup(lookupInput, {
        data: { user: wrapped.data.user },
      });
    }

    return evaluateAuthAdminLookup(lookupInput, {
      data: { user: userParsed.data },
    });
  } catch (thrown) {
    return evaluateAuthAdminLookup(lookupInput, null, thrown);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveOrganizationAndBranch(
  db: TxClient | DbClient,
  organizationCode: string,
  branchCode: string | null,
) {
  const organization = await db.organization.findFirst({
    where: { customerCode: organizationCode, deletedAt: null },
    include: {
      status: true,
      branches: {
        where: { deletedAt: null },
        include: { status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!organization) {
    throw new BootstrapError(
      "ORGANIZATION_NOT_FOUND",
      "ไม่พบองค์กรที่ระบุ",
    );
  }

  const activeBranches = organization.branches.filter(
    (b) => b.status.code === MASTER.branchStatus.ACTIVE,
  );

  let branch =
    branchCode === null
      ? null
      : activeBranches.find((b) => b.code === branchCode) ?? null;

  if (branchCode && !branch) {
    throw new BootstrapError(
      "BRANCH_NOT_FOUND",
      "ไม่พบสาขาในองค์กรที่ระบุ หรือสาขาไม่ได้อยู่ในสถานะใช้งาน",
    );
  }

  if (!branchCode) {
    if (activeBranches.length === 1) {
      branch = activeBranches[0] ?? null;
    } else if (activeBranches.length === 0) {
      throw new BootstrapError(
        "BRANCH_REQUIRED",
        "องค์กรนี้ยังไม่มีสาขาที่ใช้งาน กรุณาระบุ BOOTSTRAP_BRANCH_CODE เมื่อพร้อม",
      );
    } else {
      throw new BootstrapError(
        "BRANCH_REQUIRED",
        "องค์กรมีหลายสาขา กรุณาระบุ BOOTSTRAP_BRANCH_CODE",
      );
    }
  }

  if (!branch) {
    throw new BootstrapError(
      "BRANCH_REQUIRED",
      "ต้องระบุสาขาสำหรับผู้ดูแลระบบสูงสุด",
    );
  }

  return { organization, branch };
}

/**
 * Dry-run or execute first super-admin bootstrap in a single transaction.
 * When dryRun=true, validates everything then throws CONFIRMATION_REQUIRED
 * after building preview (caller should catch and print preview).
 */
export async function bootstrapFirstSuperAdmin(options: {
  db: DbClient;
  projectRef: string;
  input: BootstrapEnvInput;
  authUser: BootstrapAuthUser;
  dryRun: boolean;
}): Promise<BootstrapExecuteResult> {
  const preview = buildBootstrapPreview({
    projectRef: options.projectRef,
    email: options.authUser.email,
    organizationCode: options.input.organizationCode,
    branchCode: options.input.branchCode,
    confirmed: !options.dryRun,
  });

  if (options.dryRun) {
    // Still validate masters / org / branch / conflicts without writing.
    await options.db.$transaction(async (tx) => {
      await validateAndApply(tx, options, emptyCounts(), true);
    });

    return {
      ok: true,
      dryRun: true,
      preview: { ...preview, writeOperations: "NONE", confirmed: false },
      counts: emptyCounts(),
      maskedProfileId: null,
      maskedOrganizationId: null,
      maskedBranchId: null,
    };
  }

  const counts = emptyCounts();
  const result = await options.db.$transaction(async (tx) => {
    return validateAndApply(tx, options, counts, false);
  });

  return {
    ok: true,
    dryRun: false,
    preview,
    counts,
    maskedProfileId: maskUuid(result.profileId),
    maskedOrganizationId: maskUuid(result.organizationId),
    maskedBranchId: maskUuid(result.branchId),
  };
}

async function validateAndApply(
  tx: TxClient,
  options: {
    input: BootstrapEnvInput;
    authUser: BootstrapAuthUser;
  },
  counts: BootstrapWriteCounts,
  dryRun: boolean,
): Promise<{ profileId: string; organizationId: string; branchId: string }> {
  const userActive = await requireMaster(
    tx,
    "userProfileStatus",
    MASTER.userProfileStatus.ACTIVE,
    "MASTER_MISSING",
    "ไม่พบสถานะโปรไฟล์ ACTIVE",
  );
  const superAdminRole = await requireMaster(
    tx,
    "platformRole",
    MASTER.platformRole.SUPER_ADMIN,
    "ROLE_SUPER_ADMIN_MISSING",
    "ไม่พบบทบาท SUPER_ADMIN ในระบบ",
  );
  const ownerRole = await requireMaster(
    tx,
    "organizationRole",
    MASTER.organizationRole.OWNER,
    "ROLE_OWNER_MISSING",
    "ไม่พบบทบาท OWNER ขององค์กรในระบบ",
  );
  const assignmentActive = await requireMaster(
    tx,
    "assignmentStatus",
    MASTER.assignmentStatus.ACTIVE,
    "MASTER_MISSING",
    "ไม่พบสถานะการมอบหมาย ACTIVE",
  );
  const membershipActive = await requireMaster(
    tx,
    "membershipStatus",
    MASTER.membershipStatus.ACTIVE,
    "MASTER_MISSING",
    "ไม่พบสถานะสมาชิก ACTIVE",
  );
  const selectedScope = await requireMaster(
    tx,
    "branchScopeType",
    MASTER.branchScopeType.SELECTED,
    "MASTER_MISSING",
    "ไม่พบประเภทสิทธิ์สาขา SELECTED",
  );
  const allBranchesScope = await requireMaster(
    tx,
    "branchScopeType",
    MASTER.branchScopeType.ALL_BRANCHES,
    "MASTER_MISSING",
    "ไม่พบประเภทสิทธิ์สาขา ALL_BRANCHES",
  );

  const { organization, branch } = await resolveOrganizationAndBranch(
    tx,
    options.input.organizationCode,
    options.input.branchCode,
  );

  const byAuth = await tx.userProfile.findUnique({
    where: { authUserId: options.authUser.id },
  });
  const byEmail = await tx.userProfile.findUnique({
    where: { email: options.authUser.email },
  });

  if (byAuth && byEmail && byAuth.id !== byEmail.id) {
    throw new BootstrapError(
      "PROFILE_CONFLICT",
      "พบโปรไฟล์ขัดแย้งระหว่าง auth user และอีเมล — หยุดและ rollback",
    );
  }

  if (byAuth && byAuth.email.trim().toLowerCase() !== options.authUser.email) {
    throw new BootstrapError(
      "PROFILE_CONFLICT",
      "โปรไฟล์ที่ผูก Auth user มีอีเมลไม่ตรงกัน — หยุดและ rollback",
    );
  }

  if (byEmail && byEmail.authUserId !== options.authUser.id) {
    throw new BootstrapError(
      "PROFILE_CONFLICT",
      "อีเมลนี้ถูกผูกกับ Auth user อื่นแล้ว — หยุดและ rollback",
    );
  }

  let profile = byAuth ?? byEmail ?? null;
  let profileId = profile?.id ?? null;

  if (!profile) {
    if (dryRun) {
      profileId = randomUUID();
    } else {
      profile = await tx.userProfile.create({
        data: {
          authUserId: options.authUser.id,
          email: options.authUser.email,
          displayName: options.input.displayName,
          statusId: userActive.id,
        },
      });
      profileId = profile.id;
      counts.profilesCreated += 1;
    }
  } else {
    counts.reused += 1;
    if (!dryRun && profile.statusId !== userActive.id) {
      await tx.userProfile.update({
        where: { id: profile.id },
        data: { statusId: userActive.id },
      });
    }
  }

  if (!profileId) {
    throw new BootstrapError("PROFILE_CONFLICT", "ไม่สามารถกำหนดโปรไฟล์ได้");
  }

  const existingPlatformRole = await tx.platformRoleAssignment.findFirst({
    where: {
      userProfileId: profileId,
      roleId: superAdminRole.id,
      revokedAt: null,
      statusId: assignmentActive.id,
    },
  });

  if (existingPlatformRole) {
    counts.reused += 1;
  } else if (!dryRun) {
    await tx.platformRoleAssignment.create({
      data: {
        userProfileId: profileId,
        roleId: superAdminRole.id,
        statusId: assignmentActive.id,
        assignedByAuthUserId: options.authUser.id,
      },
    });
    counts.platformRolesCreated += 1;
  } else {
    counts.platformRolesCreated += 1;
  }

  let membership = await tx.organizationMembership.findUnique({
    where: {
      organizationId_userProfileId: {
        organizationId: organization.id,
        userProfileId: profileId,
      },
    },
    include: {
      roles: { include: { role: true, status: true } },
      branchScopes: { include: { scopeType: true, status: true } },
      status: true,
    },
  });

  if (membership && membership.status.code !== MASTER.membershipStatus.ACTIVE) {
    throw new BootstrapError(
      "MEMBERSHIP_CONFLICT",
      "พบการเป็นสมาชิกองค์กรเดิมที่ไม่ได้ใช้งาน — หยุดและ rollback",
    );
  }

  if (!membership) {
    if (dryRun) {
      membership = null;
    } else {
      membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userProfileId: profileId,
          statusId: membershipActive.id,
          joinedAt: new Date(),
          invitedByAuthUserId: options.authUser.id,
        },
        include: {
          roles: { include: { role: true, status: true } },
          branchScopes: { include: { scopeType: true, status: true } },
          status: true,
        },
      });
      counts.membershipsCreated += 1;
    }
  } else {
    counts.reused += 1;
  }

  const membershipId = membership?.id ?? (dryRun ? randomUUID() : null);
  if (!membershipId) {
    throw new BootstrapError(
      "MEMBERSHIP_CONFLICT",
      "ไม่สามารถสร้างการเป็นสมาชิกองค์กรได้",
    );
  }

  const hasOwner =
    membership?.roles.some(
      (r) =>
        r.role.code === MASTER.organizationRole.OWNER &&
        r.revokedAt === null &&
        r.status.code === MASTER.assignmentStatus.ACTIVE,
    ) ?? false;

  if (hasOwner) {
    counts.reused += 1;
  } else if (!dryRun) {
    await tx.organizationMembershipRole.create({
      data: {
        membershipId,
        roleId: ownerRole.id,
        statusId: assignmentActive.id,
      },
    });
    counts.membershipRolesCreated += 1;
  } else {
    counts.membershipRolesCreated += 1;
  }

  const coveredByAll =
    membership?.branchScopes.some(
      (s) =>
        s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES &&
        s.status.code === MASTER.assignmentStatus.ACTIVE,
    ) ?? false;

  const coveredBySelected =
    membership?.branchScopes.some(
      (s) =>
        s.scopeType.code === MASTER.branchScopeType.SELECTED &&
        s.branchId === branch.id &&
        s.status.code === MASTER.assignmentStatus.ACTIVE,
    ) ?? false;

  if (coveredByAll || coveredBySelected) {
    counts.reused += 1;
  } else if (!dryRun) {
    await tx.organizationMembershipBranchScope.create({
      data: {
        membershipId,
        scopeTypeId: selectedScope.id,
        branchId: branch.id,
        statusId: assignmentActive.id,
      },
    });
    counts.branchScopesCreated += 1;
  } else {
    counts.branchScopesCreated += 1;
  }

  // Silence unused — allBranchesScope proves master exists for verify path.
  void allBranchesScope;

  if (!dryRun) {
    const auditAction = await ensureAuditAction(tx);
    const existingAudit = await tx.auditLog.findFirst({
      where: {
        actionTypeId: auditAction.id,
        actorAuthUserId: options.authUser.id,
        entityType: "user_profile",
        entityId: profileId,
        organizationId: organization.id,
      },
    });

    if (existingAudit) {
      counts.reused += 1;
    } else {
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorAuthUserId: options.authUser.id,
          actionTypeId: auditAction.id,
          entityType: "user_profile",
          entityId: profileId,
          afterJson: {
            userProfileId: profileId,
            organizationId: organization.id,
            branchId: branch.id,
            source: BOOTSTRAP_SOURCE,
            timestamp: new Date().toISOString(),
          },
          userAgent: BOOTSTRAP_SOURCE,
        },
      });
      counts.auditsCreated += 1;
    }
  }

  return {
    profileId,
    organizationId: organization.id,
    branchId: branch.id,
  };
}

export async function verifyFirstSuperAdmin(options: {
  db: DbClient;
  input: BootstrapEnvInput;
  authUser: BootstrapAuthUser | null;
}): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];

  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
  };

  push(
    "auth_user",
    Boolean(options.authUser),
    options.authUser
      ? `พบบัญชี Auth (${maskEmail(options.authUser.email)})`
      : "ไม่พบบัญชีผู้ใช้งานใน Supabase Auth",
  );

  push(
    "email_confirmed",
    Boolean(options.authUser?.emailConfirmedAt),
    options.authUser?.emailConfirmedAt
      ? "อีเมลได้รับการยืนยันแล้ว"
      : "อีเมลยังไม่ได้รับการยืนยัน",
  );

  push(
    "email_match",
    Boolean(
      options.authUser &&
        options.authUser.email.trim().toLowerCase() === options.input.adminEmail,
    ),
    options.authUser &&
      options.authUser.email.trim().toLowerCase() === options.input.adminEmail
      ? "อีเมลตรงกับค่าที่กำหนด"
      : "อีเมลของบัญชี Auth ไม่ตรงกับ BOOTSTRAP_ADMIN_EMAIL",
  );

  if (!options.authUser) {
    return { ok: false, checks };
  }

  const profile = await options.db.userProfile.findUnique({
    where: { authUserId: options.authUser.id },
    include: { status: true },
  });

  push(
    "profile_active",
    Boolean(profile && profile.status.code === MASTER.userProfileStatus.ACTIVE),
    profile
      ? profile.status.code === MASTER.userProfileStatus.ACTIVE
        ? "โปรไฟล์ใช้งานอยู่"
        : "โปรไฟล์ไม่ได้ใช้งาน"
      : "ไม่พบโปรไฟล์ผู้ใช้",
  );

  if (!profile) {
    return { ok: false, checks };
  }

  const superRoles = await options.db.platformRoleAssignment.findMany({
    where: {
      userProfileId: profile.id,
      revokedAt: null,
      role: { code: MASTER.platformRole.SUPER_ADMIN },
      status: { code: MASTER.assignmentStatus.ACTIVE },
    },
  });

  push(
    "platform_role_super_admin",
    superRoles.length === 1,
    superRoles.length === 1
      ? "มีบทบาท SUPER_ADMIN"
      : superRoles.length === 0
        ? "ไม่พบบทบาท SUPER_ADMIN"
        : "พบบทบาท SUPER_ADMIN ซ้ำ",
  );

  const organization = await options.db.organization.findFirst({
    where: { customerCode: options.input.organizationCode, deletedAt: null },
  });

  push(
    "organization",
    Boolean(organization),
    organization ? "พบองค์กรที่ระบุ" : "ไม่พบองค์กรที่ระบุ",
  );

  if (!organization) {
    return { ok: false, checks };
  }

  const membership = await options.db.organizationMembership.findUnique({
    where: {
      organizationId_userProfileId: {
        organizationId: organization.id,
        userProfileId: profile.id,
      },
    },
    include: {
      status: true,
      roles: { include: { role: true, status: true } },
      branchScopes: { include: { scopeType: true, status: true, branch: true } },
    },
  });

  push(
    "membership_active",
    Boolean(
      membership && membership.status.code === MASTER.membershipStatus.ACTIVE,
    ),
    membership
      ? membership.status.code === MASTER.membershipStatus.ACTIVE
        ? "การเป็นสมาชิกองค์กรใช้งานอยู่"
        : "การเป็นสมาชิกองค์กรไม่ได้ใช้งาน"
      : "ไม่พบการเป็นสมาชิกองค์กร",
  );

  const ownerRoles =
    membership?.roles.filter(
      (r) =>
        r.role.code === MASTER.organizationRole.OWNER &&
        r.revokedAt === null &&
        r.status.code === MASTER.assignmentStatus.ACTIVE,
    ) ?? [];

  push(
    "organization_role_owner",
    ownerRoles.length === 1,
    ownerRoles.length === 1
      ? "มีบทบาท OWNER"
      : ownerRoles.length === 0
        ? "ไม่พบบทบาท OWNER"
        : "พบบทบาท OWNER ซ้ำ",
  );

  let branchOk = false;
  let branchDetail = "ยังไม่ตรวจสอบสาขา";
  if (membership) {
    try {
      const { branch } = await resolveOrganizationAndBranch(
        options.db,
        options.input.organizationCode,
        options.input.branchCode,
      );
      const hasAll = membership.branchScopes.some(
        (s) =>
          s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES &&
          s.status.code === MASTER.assignmentStatus.ACTIVE,
      );
      const hasSelected = membership.branchScopes.some(
        (s) =>
          s.scopeType.code === MASTER.branchScopeType.SELECTED &&
          s.branchId === branch.id &&
          s.status.code === MASTER.assignmentStatus.ACTIVE,
      );
      branchOk = hasAll || hasSelected;
      branchDetail = branchOk
        ? "สิทธิ์เข้าถึงสาขาถูกต้อง"
        : "ไม่พบสิทธิ์เข้าถึงสาขาที่กำหนด";
    } catch (error) {
      branchOk = false;
      branchDetail =
        error instanceof BootstrapError
          ? error.message
          : "ตรวจสอบสาขาไม่สำเร็จ";
    }
  }

  push("branch_access", branchOk, branchDetail);

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

export function formatPreviewThai(preview: BootstrapPreview): string[] {
  const lines = [
    "=== ตัวอย่างก่อนสร้างผู้ดูแลระบบสูงสุด ===",
    `Project ref: ${preview.projectRef}`,
    `อีเมล Auth: ${preview.maskedEmail}`,
    `รหัสองค์กร: ${preview.organizationCode}`,
    `รหัสสาขา: ${preview.branchCode ?? "(เลือกอัตโนมัติถ้ามีสาขาเดียว)"}`,
    "การเปลี่ยนแปลงที่จะเกิดขึ้น:",
    ...preview.changes.map((c) => `  - ${c}`),
    `Write operations: ${preview.writeOperations}`,
  ];

  if (!preview.confirmed) {
    lines.push("ยังไม่มีการเขียนข้อมูล");
    lines.push(
      `ตั้ง BOOTSTRAP_CONFIRM=${BOOTSTRAP_CONFIRM_VALUE} เพื่อยืนยันการเขียน`,
    );
  } else {
    lines.push("พร้อมสร้างผู้ดูแลระบบสูงสุด");
  }

  return lines;
}
