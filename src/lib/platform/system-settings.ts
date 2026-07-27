import type { PrismaClient } from "@prisma/client";

export const SYSTEM_SETTING_KEYS = {
  invitationsSendEnabled: "auth.invitations.send_enabled",
  phoneLoginEnabled: "auth.login.phone_enabled",
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

export type AuthFlexibilitySettings = {
  invitationsSendEnabled: boolean;
  phoneLoginEnabled: boolean;
};

const DEFAULTS: AuthFlexibilitySettings = {
  invitationsSendEnabled: true,
  phoneLoginEnabled: false,
};

type SettingRow = {
  key: string;
  value_json: unknown;
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/**
 * Use SQL against platform.system_settings so toggles work even when the
 * Prisma client process was started before the SystemSetting model existed.
 */
export async function getAuthFlexibilitySettings(
  db: PrismaClient,
): Promise<AuthFlexibilitySettings> {
  try {
    const rows = await db.$queryRaw<SettingRow[]>`
      SELECT key, value_json
      FROM platform.system_settings
      WHERE key IN (
        ${SYSTEM_SETTING_KEYS.invitationsSendEnabled},
        ${SYSTEM_SETTING_KEYS.phoneLoginEnabled}
      )
    `;
    const map = new Map(rows.map((row) => [row.key, row.value_json]));
    return {
      invitationsSendEnabled: asBoolean(
        map.get(SYSTEM_SETTING_KEYS.invitationsSendEnabled),
        DEFAULTS.invitationsSendEnabled,
      ),
      phoneLoginEnabled: asBoolean(
        map.get(SYSTEM_SETTING_KEYS.phoneLoginEnabled),
        DEFAULTS.phoneLoginEnabled,
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function isInvitationSendEnabled(
  db: PrismaClient,
): Promise<boolean> {
  const settings = await getAuthFlexibilitySettings(db);
  return settings.invitationsSendEnabled;
}

export async function isPhoneLoginEnabled(db: PrismaClient): Promise<boolean> {
  const settings = await getAuthFlexibilitySettings(db);
  return settings.phoneLoginEnabled;
}

async function upsertBooleanSetting(
  db: PrismaClient,
  key: SystemSettingKey,
  value: boolean,
  actorAuthUserId: string,
) {
  await db.$executeRawUnsafe(
    `INSERT INTO platform.system_settings (key, value_json, updated_by_auth_user_id)
     VALUES ($1, $2::jsonb, $3::uuid)
     ON CONFLICT (key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_by_auth_user_id = EXCLUDED.updated_by_auth_user_id,
       updated_at = NOW()`,
    key,
    JSON.stringify(value),
    actorAuthUserId,
  );
}

export async function setAuthFlexibilitySettings(
  db: PrismaClient,
  input: {
    actorAuthUserId: string;
    invitationsSendEnabled?: boolean;
    phoneLoginEnabled?: boolean;
  },
): Promise<AuthFlexibilitySettings> {
  if (typeof input.invitationsSendEnabled === "boolean") {
    await upsertBooleanSetting(
      db,
      SYSTEM_SETTING_KEYS.invitationsSendEnabled,
      input.invitationsSendEnabled,
      input.actorAuthUserId,
    );
  }
  if (typeof input.phoneLoginEnabled === "boolean") {
    await upsertBooleanSetting(
      db,
      SYSTEM_SETTING_KEYS.phoneLoginEnabled,
      input.phoneLoginEnabled,
      input.actorAuthUserId,
    );
  }

  return getAuthFlexibilitySettings(db);
}

/** Convert Thai local mobile (0XXXXXXXXX) to E.164 for Supabase phone auth. */
export function toE164ThaiMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^0[689]\d{8}$/.test(digits)) {
    return `+66${digits.slice(1)}`;
  }
  if (/^66[689]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^\+66[689]\d{8}$/.test(raw.trim())) {
    return raw.trim();
  }
  return null;
}

/** Auth login email when the user only has a phone (no real mailbox). */
export function syntheticEmailFromPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `p${digits}@phone.users.goldensoft.app`;
}

/** Resolve the email identity used in Auth + UserProfile. */
export function resolveLoginEmail(input: {
  email?: string | null;
  phoneE164?: string | null;
}): string | null {
  const email = input.email?.trim().toLowerCase() || null;
  if (email) return email;
  if (input.phoneE164) return syntheticEmailFromPhone(input.phoneE164);
  return null;
}

/** Local 10-digit form of an E.164 Thai mobile (+668xxxxxxxx → 08xxxxxxxx). */
export function localThaiMobileFromE164(phoneE164: string): string | null {
  const digits = phoneE164.replace(/\D/g, "");
  if (/^66[689]\d{8}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }
  if (/^0[689]\d{8}$/.test(digits)) {
    return digits;
  }
  return null;
}

/**
 * Map a phone login attempt to the Auth email for that person.
 * Supports: user_profiles.phone (E.164), staff_profiles.phone (local), or
 * synthetic phone-only emails.
 */
export async function resolveAuthEmailForPhoneLogin(
  db: PrismaClient,
  phoneE164: string,
): Promise<string | null> {
  const byProfilePhone = await db.userProfile.findFirst({
    where: { deletedAt: null, phone: phoneE164 },
    select: { email: true },
  });
  if (byProfilePhone?.email) {
    return byProfilePhone.email.toLowerCase();
  }

  const local = localThaiMobileFromE164(phoneE164);
  if (local) {
    const dashed = `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
    let profile:
      | { id: string; email: string; phone: string | null }
      | null
      | undefined;

    const exact = await db.staffProfile.findFirst({
      where: {
        OR: [{ phone: local }, { phone: dashed }],
        userProfile: { deletedAt: null },
      },
      select: {
        userProfile: { select: { id: true, email: true, phone: true } },
      },
    });
    profile = exact?.userProfile;

    if (!profile) {
      const staffCandidates = await db.staffProfile.findMany({
        where: {
          phone: { not: null },
          userProfile: { deletedAt: null },
        },
        select: {
          phone: true,
          userProfile: { select: { id: true, email: true, phone: true } },
        },
        take: 5000,
      });
      const match = staffCandidates.find((row) => {
        const digits = (row.phone ?? "").replace(/\D/g, "");
        return digits === local || digits === `66${local.slice(1)}`;
      });
      profile = match?.userProfile;
    }

    if (profile?.email) {
      if (!profile.phone) {
        try {
          await db.userProfile.update({
            where: { id: profile.id },
            data: { phone: phoneE164 },
          });
        } catch {
          // Unique conflict — still allow login via email.
        }
      }
      return profile.email.toLowerCase();
    }
  }

  // Phone-only accounts use a synthetic mailbox in Auth.
  return syntheticEmailFromPhone(phoneE164);
}
