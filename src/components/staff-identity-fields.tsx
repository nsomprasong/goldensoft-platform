"use client";

import type { ChangeEvent } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";
import {
  formatIsoDateToThai,
  formatNationalIdForDisplay,
  formatNationalIdInput,
  formatPhoneForDisplay,
  formatPhoneInput,
  formatThaiDateInput,
  STAFF_TITLE_OPTIONS,
} from "@/lib/platform/staff-identity";

export type StaffIdentityFormValues = {
  titleCode: string;
  firstNameTh: string;
  lastNameTh: string;
  nationalId: string;
  dateOfBirth: string;
  addressLine: string;
  phone: string;
};

export const EMPTY_STAFF_IDENTITY: StaffIdentityFormValues = {
  titleCode: "MR",
  firstNameTh: "",
  lastNameTh: "",
  nationalId: "",
  dateOfBirth: "",
  addressLine: "",
  phone: "",
};

export function emptyStaffIdentityFormValues(): StaffIdentityFormValues {
  return { ...EMPTY_STAFF_IDENTITY };
}

/** Normalize server/DB values into the Thai display formats used by the form. */
export function toStaffIdentityFormValues(
  initial?: Partial<StaffIdentityFormValues> | null,
): StaffIdentityFormValues {
  const base = { ...EMPTY_STAFF_IDENTITY, ...initial };
  return {
    ...base,
    nationalId: base.nationalId
      ? formatNationalIdForDisplay(String(base.nationalId))
      : "",
    phone: base.phone ? formatPhoneForDisplay(base.phone) : "",
    dateOfBirth: base.dateOfBirth
      ? /^\d{4}-\d{2}-\d{2}$/.test(base.dateOfBirth)
        ? formatIsoDateToThai(base.dateOfBirth)
        : formatThaiDateInput(base.dateOfBirth)
      : "",
  };
}

/** Shared civil-ID style fields — fully controlled so values survive failed submits. */
export function StaffIdentityFields(props: {
  values: StaffIdentityFormValues;
  onChange: (patch: Partial<StaffIdentityFormValues>) => void;
  /** Prefix control ids when embedding beside other forms. */
  idPrefix?: string;
  /** Require national ID (individual customers / tax invoices). */
  requireNationalId?: boolean;
  nationalIdHint?: string;
}) {
  const { values, onChange } = props;
  const prefix = props.idPrefix ?? "";
  const nationalIdHint =
    props.nationalIdHint ??
    (props.requireNationalId
      ? TH.staff.nationalIdHint
      : TH.staff.nationalIdOptionalHint);

  function fieldId(name: string) {
    return `${prefix}${name}`;
  }

  function setField<K extends keyof StaffIdentityFormValues>(
    key: K,
    value: StaffIdentityFormValues[K],
  ) {
    onChange({ [key]: value });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={TH.staff.titleLabel} htmlFor={fieldId("titleCode")} required>
        <select
          id={fieldId("titleCode")}
          name="titleCode"
          className="input"
          required
          value={values.titleCode}
          onChange={(event) => setField("titleCode", event.target.value)}
        >
          {STAFF_TITLE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label={TH.staff.nationalId}
        htmlFor={fieldId("nationalId")}
        required={props.requireNationalId}
        hint={nationalIdHint}
      >
        <Input
          id={fieldId("nationalId")}
          name="nationalId"
          inputMode="numeric"
          autoComplete="off"
          required={props.requireNationalId}
          maxLength={17}
          pattern="\d-\d{4}-\d{5}-\d{2}-\d"
          title={nationalIdHint}
          placeholder="1-2345-67890-12-3"
          value={values.nationalId}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setField("nationalId", formatNationalIdInput(event.target.value))
          }
        />
      </FormField>
      <FormField
        label={TH.staff.firstNameTh}
        htmlFor={fieldId("firstNameTh")}
        required
      >
        <Input
          id={fieldId("firstNameTh")}
          name="firstNameTh"
          required
          maxLength={100}
          value={values.firstNameTh}
          onChange={(event) => setField("firstNameTh", event.target.value)}
        />
      </FormField>
      <FormField
        label={TH.staff.lastNameTh}
        htmlFor={fieldId("lastNameTh")}
        required
      >
        <Input
          id={fieldId("lastNameTh")}
          name="lastNameTh"
          required
          maxLength={100}
          value={values.lastNameTh}
          onChange={(event) => setField("lastNameTh", event.target.value)}
        />
      </FormField>
      <FormField
        label={TH.staff.dateOfBirth}
        htmlFor={fieldId("dateOfBirth")}
        required
        hint={TH.staff.dateOfBirthHint}
      >
        <Input
          id={fieldId("dateOfBirth")}
          name="dateOfBirth"
          inputMode="numeric"
          autoComplete="bday"
          required
          maxLength={10}
          pattern="\d{2}/\d{2}/\d{4}"
          title={TH.staff.dateOfBirthHint}
          placeholder="29/07/2540"
          value={values.dateOfBirth}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setField("dateOfBirth", formatThaiDateInput(event.target.value))
          }
        />
      </FormField>
      <FormField
        label={TH.staff.phone}
        htmlFor={fieldId("phone")}
        required
        hint={TH.staff.phoneHint}
      >
        <Input
          id={fieldId("phone")}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={12}
          pattern="0\d{2}-\d{3}-\d{4}"
          title={TH.staff.phoneHint}
          placeholder="081-234-5678"
          value={values.phone}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setField("phone", formatPhoneInput(event.target.value))
          }
        />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label={TH.staff.addressLine} htmlFor={fieldId("addressLine")}>
          <Input
            id={fieldId("addressLine")}
            name="addressLine"
            maxLength={500}
            value={values.addressLine}
            onChange={(event) => setField("addressLine", event.target.value)}
          />
        </FormField>
      </div>
    </div>
  );
}
