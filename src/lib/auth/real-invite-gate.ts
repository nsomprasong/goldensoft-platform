import {
  REAL_INVITE_CONFIRM_VALUE,
  type AuthInviteMode,
} from "@/lib/auth/invite-env";

export type RealInviteGateConfig = {
  testEmailNormalized: string | null;
  confirmConfigured: boolean;
  confirmValid: boolean;
};

export type RealInviteDecision =
  | {
      action: "allow";
      email: string;
    }
  | {
      action: "preview";
      email: string;
      code: "REAL_INVITE_PREVIEW";
      message: string;
      writeOperations: "NONE";
    }
  | {
      action: "reject";
      email: string;
      code:
        | "REAL_INVITE_CONFIRMATION_INVALID"
        | "REAL_INVITE_EMAIL_NOT_ALLOWED";
      message: string;
    };

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mask email for logs/UI — never return the full address. */
export function maskInviteEmail(email: string): string {
  const normalized = normalizeInviteEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/**
 * First-real-invite safety gate. Reads server environment only.
 * Client-supplied confirmation must never be accepted.
 */
export function resolveRealInviteGate(
  input: Record<string, string | undefined> = process.env,
): RealInviteGateConfig {
  const rawConfirm = input.AUTH_REAL_INVITE_CONFIRM?.trim() ?? "";
  const rawEmail = input.AUTH_REAL_INVITE_TEST_EMAIL?.trim() ?? "";
  return {
    testEmailNormalized: rawEmail ? normalizeInviteEmail(rawEmail) : null,
    confirmConfigured: rawConfirm.length > 0,
    confirmValid: rawConfirm === REAL_INVITE_CONFIRM_VALUE,
  };
}

/**
 * Decide whether a real Auth invite/resend may proceed.
 * Mock mode always allows (no real network send from mock adapter).
 */
export function evaluateRealInviteSend(input: {
  mode: AuthInviteMode;
  email: string;
  gate?: RealInviteGateConfig;
  env?: Record<string, string | undefined>;
}): RealInviteDecision {
  const email = normalizeInviteEmail(input.email);
  if (input.mode !== "real") {
    return { action: "allow", email };
  }

  const gate = input.gate ?? resolveRealInviteGate(input.env ?? process.env);

  if (!gate.confirmConfigured) {
    return {
      action: "preview",
      email,
      code: "REAL_INVITE_PREVIEW",
      message:
        "โหมดตัวอย่าง: ยังไม่ส่งอีเมลจริง ตั้ง AUTH_REAL_INVITE_CONFIRM=SEND_ONE_REAL_INVITE ก่อน",
      writeOperations: "NONE",
    };
  }

  if (!gate.confirmValid) {
    return {
      action: "reject",
      email,
      code: "REAL_INVITE_CONFIRMATION_INVALID",
      message: "ค่า AUTH_REAL_INVITE_CONFIRM ไม่ถูกต้อง",
    };
  }

  // Optional allowlist: when set, only that one mailbox may receive real invites.
  // When omitted (after confirm), any email is allowed — normal production use.
  if (gate.testEmailNormalized && email !== gate.testEmailNormalized) {
    return {
      action: "reject",
      email,
      code: "REAL_INVITE_EMAIL_NOT_ALLOWED",
      message:
        "อนุญาตส่งคำเชิญจริงเฉพาะอีเมลใน AUTH_REAL_INVITE_TEST_EMAIL — ล้างค่านี้ถ้าต้องการส่งได้ทุกอีเมล",
    };
  }

  return { action: "allow", email };
}
