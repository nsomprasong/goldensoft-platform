import { z } from "zod";

import { TH } from "@/lib/i18n/th";

/** Official-style Thai name titles used when recording staff identity. */
export const STAFF_TITLE_CODES = ["MR", "MRS", "MS", "OTHER"] as const;
export type StaffTitleCode = (typeof STAFF_TITLE_CODES)[number];

export const STAFF_TITLE_OPTIONS: Array<{
  code: StaffTitleCode;
  label: string;
}> = [
  { code: "MR", label: TH.staff.titleMr },
  { code: "MRS", label: TH.staff.titleMrs },
  { code: "MS", label: TH.staff.titleMs },
  { code: "OTHER", label: TH.staff.titleOther },
];

/** Display / input mask: X-XXXX-XXXXX-XX-X (13 digits). */
export const NATIONAL_ID_FORMAT_PATTERN =
  /^\d-\d{4}-\d{5}-\d{2}-\d$/;

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const FULLWIDTH_DIGITS = "０１２３４５６７８９";

export function labelStaffTitle(code: string): string {
  return STAFF_TITLE_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

/**
 * Convert Thai / fullwidth digits to ASCII 0-9 and drop every other character.
 * Needed because JS `\d` / `\D` do not treat Thai numerals as digits.
 */
export function digitize(raw: string): string {
  let out = "";
  for (const char of raw) {
    const thai = THAI_DIGITS.indexOf(char);
    if (thai >= 0) {
      out += String(thai);
      continue;
    }
    const fullwidth = FULLWIDTH_DIGITS.indexOf(char);
    if (fullwidth >= 0) {
      out += String(fullwidth);
      continue;
    }
    if (char >= "0" && char <= "9") {
      out += char;
    }
  }
  return out;
}

/**
 * Thai national ID checksum (modulus-11). Digits only, exactly 13 characters.
 * Official rule: x = sum(Ni*(14-i)) mod 11; check = x<=1 ? 1-x : 11-x
 * which is equivalent to (11 - x) % 10.
 */
export function isValidThaiNationalId(raw: string): boolean {
  const id = normalizeNationalId(raw);
  if (id.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(id[i]) * (13 - i);
  }
  const remainder = sum % 11;
  const check = remainder <= 1 ? 1 - remainder : 11 - remainder;
  return check === Number(id[12]);
}

export function normalizeNationalId(raw: string): string {
  return digitize(raw).slice(0, 13);
}

/** Formats digits into the civil-ID layout while typing (partial-safe). */
export function formatNationalIdInput(raw: string): string {
  const digits = normalizeNationalId(raw);
  const parts = [
    digits.slice(0, 1),
    digits.slice(1, 5),
    digits.slice(5, 10),
    digits.slice(10, 12),
    digits.slice(12, 13),
  ].filter((part) => part.length > 0);
  return parts.join("-");
}

export function formatNationalIdForDisplay(nationalId: string): string {
  const digits = normalizeNationalId(nationalId);
  if (digits.length !== 13) return nationalId;
  return formatNationalIdInput(digits);
}

export function isNationalIdFormat(raw: string): boolean {
  return NATIONAL_ID_FORMAT_PATTERN.test(raw.trim());
}

/** Display / input mask for Thai local numbers: 0XX-XXX-XXXX (10 digits). */
export const PHONE_FORMAT_PATTERN = /^0\d{2}-\d{3}-\d{4}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

/** Formats digits into 0XX-XXX-XXXX while typing (partial-safe). */
export function formatPhoneInput(raw: string): string {
  const digits = normalizePhone(raw);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 10),
  ].filter((part) => part.length > 0);
  return parts.join("-");
}

export function formatPhoneForDisplay(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return phone;
  return formatPhoneInput(digits);
}

export function isPhoneFormat(raw: string): boolean {
  return PHONE_FORMAT_PATTERN.test(raw.trim());
}

export function isValidThaiPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  // Local Thai numbers: 10 digits starting with 0 (mobile / most landlines).
  return /^0\d{9}$/.test(digits);
}

/** Display / input mask: dd/mm/yyyy */
export const THAI_DATE_FORMAT_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

export function normalizeDateDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

/** Formats digits into dd/mm/yyyy while typing (partial-safe). */
export function formatThaiDateInput(raw: string): string {
  const digits = normalizeDateDigits(raw);
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 8),
  ].filter((part) => part.length > 0);
  return parts.join("/");
}

/** Convert Gregorian (ค.ศ.) ISO date to Thai display dd/mm/yyyy in พ.ศ. */
export function formatIsoDateToThai(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-");
  const beYear = String(Number(year) + 543).padStart(4, "0");
  return `${day}/${month}/${beYear}`;
}

/**
 * Parse dd/mm/yyyy (พ.ศ. or ค.ศ.) or yyyy-mm-dd into Gregorian ISO yyyy-mm-dd.
 * Years >= 2400 are treated as Buddhist Era (พ.ศ. − 543 = ค.ศ.).
 */
export function parseThaiOrIsoDateToIso(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidIsoDateOnly(value) ? value : null;
  }
  if (!THAI_DATE_FORMAT_PATTERN.test(value)) return null;
  const [day, month, yearText] = value.split("/");
  const yearNumber = Number(yearText);
  if (!Number.isInteger(yearNumber)) return null;
  const ceYear = yearNumber >= 2400 ? yearNumber - 543 : yearNumber;
  if (ceYear < 1900 || ceYear > 2100) return null;
  const iso = `${String(ceYear).padStart(4, "0")}-${month}-${day}`;
  return isValidIsoDateOnly(iso) ? iso : null;
}

function isValidIsoDateOnly(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== iso) return false;
  const today = new Date();
  const todayIso = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
  return iso <= todayIso && iso >= "1900-01-01";
}

export function composeStaffDisplayName(input: {
  titleCode: string;
  firstNameTh: string;
  lastNameTh: string;
}): string {
  const title = labelStaffTitle(input.titleCode);
  return `${title} ${input.firstNameTh} ${input.lastNameTh}`.replace(/\s+/g, " ").trim();
}

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    z
      .string()
      .trim()
      .max(max)
      .transform((value) => (value ? value : null)),
  );

const nationalIdOptionalSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z
    .string()
    .trim()
    .transform(normalizeNationalId)
    .refine((digits) => digits.length === 0 || digits.length === 13, {
      message: TH.staff.nationalIdFormatInvalid,
    })
    .refine(
      (digits) => digits.length === 0 || isValidThaiNationalId(digits),
      { message: TH.staff.nationalIdInvalid },
    )
    .transform((digits) => (digits.length === 0 ? null : digits)),
);

const staffIdentityBaseSchema = z.object({
  titleCode: z.enum(STAFF_TITLE_CODES),
  firstNameTh: z.string().trim().min(1).max(100),
  lastNameTh: z.string().trim().min(1).max(100),
  dateOfBirth: z
    .string()
    .trim()
    .refine(
      (value) =>
        THAI_DATE_FORMAT_PATTERN.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value),
      { message: TH.staff.dateOfBirthFormatInvalid },
    )
    .transform((value, ctx) => {
      const iso = parseThaiOrIsoDateToIso(value);
      if (!iso) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: TH.staff.dateOfBirthInvalid,
        });
        return z.NEVER;
      }
      return iso;
    }),
  addressLine: optionalText(500),
  phone: z
    .string()
    .trim()
    .min(1, TH.staff.phoneRequired)
    .refine(
      (value) => isPhoneFormat(value) || isValidThaiPhone(value),
      { message: TH.staff.phoneFormatInvalid },
    )
    .transform(normalizePhone)
    .refine(isValidThaiPhone, { message: TH.staff.phoneInvalid }),
});

export const staffIdentityFieldsSchema = staffIdentityBaseSchema.extend({
  // Optional for staff (testing); validate checksum only when provided.
  nationalId: nationalIdOptionalSchema,
});

/**
 * Individual customer identity (tax invoice).
 * TEMP: national ID optional for onboarding tests — restore nationalIdRequiredSchema later.
 */
export const individualCustomerIdentitySchema = staffIdentityBaseSchema.extend({
  nationalId: nationalIdOptionalSchema,
});

export type StaffIdentityFields = z.infer<typeof staffIdentityFieldsSchema>;
export type IndividualCustomerIdentity = z.infer<
  typeof individualCustomerIdentitySchema
>;

export function staffIdentityToDb(fields: StaffIdentityFields) {
  return {
    titleCode: fields.titleCode,
    firstNameTh: fields.firstNameTh,
    lastNameTh: fields.lastNameTh,
    firstNameEn: null as string | null,
    lastNameEn: null as string | null,
    nationalId: fields.nationalId,
    dateOfBirth: new Date(`${fields.dateOfBirth}T00:00:00.000Z`),
    addressLine: fields.addressLine,
    phone: fields.phone,
  };
}

export function staffIdentityFromDb(row: {
  titleCode: string;
  firstNameTh: string;
  lastNameTh: string;
  nationalId: string | null;
  dateOfBirth: Date;
  addressLine: string | null;
  phone: string | null;
}): StaffIdentityFields {
  return {
    titleCode: row.titleCode as StaffTitleCode,
    firstNameTh: row.firstNameTh,
    lastNameTh: row.lastNameTh,
    nationalId: row.nationalId
      ? formatNationalIdForDisplay(row.nationalId)
      : null,
    dateOfBirth: formatIsoDateToThai(row.dateOfBirth.toISOString().slice(0, 10)),
    addressLine: row.addressLine,
    phone: row.phone ? formatPhoneForDisplay(row.phone) : "",
  };
}
